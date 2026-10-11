/**
 * POST /api/subscription-audit — read-only fail-open check.
 * Assertions are scoped to each test's own subscription id: the route is
 * unscoped (like the real cron) and the shared test DB holds other members.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { seedMember, seedSubscription, cleanupMember } from "@tests/helpers";
import { POST, classify } from "@/app/api/subscription-audit/route";

const { mockRetrieve, mockUpdate } = vi.hoisted(() => ({
  mockRetrieve: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ subscriptions: { retrieve: mockRetrieve, update: mockUpdate } }),
}));

function req(bearer?: string) {
  return new NextRequest("http://localhost/api/subscription-audit", {
    method: "POST",
    headers: { authorization: `Bearer ${bearer ?? process.env.MATCHER_API_SECRET}` },
  });
}

function stripeSub(o: Record<string, unknown> = {}) {
  return {
    id: "sub_x",
    status: "active",
    pause_collection: null,
    default_payment_method: "pm_1",
    trial_end: null,
    customer: { id: "cus_1", deleted: false, default_source: null, invoice_settings: { default_payment_method: null } },
    items: { data: [{ price: { lookup_key: "pp_monthly" }, current_period_end: 1893456000 }] },
    ...o,
  } as never;
}

describe("classify", () => {
  const member = { id: "m1", matches_remaining: 2 };
  it("flags an unpaused chargeable subscription", () => {
    const r = classify(stripeSub(), member);
    expect(r.kind).toBe("flagged");
  });
  it("passes a paused one", () => {
    expect(classify(stripeSub({ pause_collection: { behavior: "void" } }), member).kind).toBe("ok");
  });
  it("ignores canceled / past_due statuses", () => {
    expect(classify(stripeSub({ status: "canceled" }), member).kind).toBe("ok");
  });
  it("skips FYP", () => {
    const s = stripeSub({ items: { data: [{ price: { lookup_key: "fyp_monthly_single" } }] } });
    expect(classify(s, member).kind).toBe("skipped_fyp");
  });
  it("skips comped subscriptions with no payment method", () => {
    expect(classify(stripeSub({ default_payment_method: null }), member).kind).toBe("skipped_not_chargeable");
  });
  it("uses trial_end as next charge for trialing", () => {
    const r = classify(stripeSub({ status: "trialing", trial_end: 1800000000 }), member);
    expect(r.kind === "flagged" && r.flag.nextChargeAt).toBe(new Date(1800000000 * 1000).toISOString());
  });
});

describe("classify: comped and in-flight", () => {
  const member = { id: "m1", matches_remaining: 2 };
  const NOW = 1_800_000_000_000;
  const invoice = (o: Record<string, unknown> = {}) => ({
    id: "in_1",
    status: "open",
    created: NOW / 1000 - 2 * 86400,
    attempt_count: 1,
    next_payment_attempt: null,
    ...o,
  });

  it("skips comped members even when a card is on file", () => {
    expect(classify(stripeSub(), { ...member, billing_mode: "comped_with_perks" }, NOW).kind).toBe("skipped_comped");
    expect(classify(stripeSub(), { ...member, billing_mode: "comped_no_perks" }, NOW).kind).toBe("skipped_comped");
  });
  it("still flags a subscription-mode member", () => {
    expect(classify(stripeSub(), { ...member, billing_mode: "subscription" }, NOW).kind).toBe("flagged");
  });
  it("reports an open invoice with no retry as in flight, not flagged", () => {
    const r = classify(stripeSub({ latest_invoice: invoice() }), member, NOW);
    expect(r.kind).toBe("in_flight");
  });
  it("reports an open invoice with a retry scheduled as a failed payment", () => {
    const r = classify(
      stripeSub({ latest_invoice: invoice({ attempt_count: 2, next_payment_attempt: NOW / 1000 + 86400 }) }),
      member,
      NOW
    );
    expect(r.kind).toBe("payment_failed");
  });
  it("flags an in-flight invoice that has gone stale", () => {
    const r = classify(stripeSub({ latest_invoice: invoice({ created: NOW / 1000 - 30 * 86400 }) }), member, NOW);
    expect(r.kind).toBe("flagged");
  });
  it("flags when the latest invoice is paid (pause missing)", () => {
    expect(classify(stripeSub({ latest_invoice: invoice({ status: "paid" }) }), member, NOW).kind).toBe("flagged");
  });
});

describe("POST /api/subscription-audit", () => {
  let memberId = "";
  beforeEach(() => {
    mockRetrieve.mockReset().mockResolvedValue(stripeSub({ pause_collection: { behavior: "void" } }));
    mockUpdate.mockReset();
  });
  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
    memberId = "";
  });

  it("rejects the wrong bearer token", async () => {
    expect((await POST(req("nope"))).status).toBe(401);
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  it("reports an unpaused subscription and never writes to Stripe", async () => {
    const member = await seedMember({ status: "active", matches_remaining: 3 });
    memberId = member.id;
    const sub = await seedSubscription(memberId, { status: "active" });
    mockRetrieve.mockImplementation(async (id: string) =>
      id === sub.stripe_subscription_id ? stripeSub({ id }) : stripeSub({ pause_collection: { behavior: "void" } })
    );
    const body = await (await POST(req())).json();
    const mine = body.flagged.find((f: { subscriptionId: string }) => f.subscriptionId === sub.stripe_subscription_id);
    expect(mine).toMatchObject({ memberId, matchesRemaining: 3 });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("records a Stripe failure per subscription without aborting", async () => {
    const member = await seedMember({ status: "active", matches_remaining: 1 });
    memberId = member.id;
    const sub = await seedSubscription(memberId, { status: "active" });
    mockRetrieve.mockImplementation(async (id: string) => {
      if (id === sub.stripe_subscription_id) throw new Error("boom");
      return stripeSub({ pause_collection: { behavior: "void" } });
    });
    const body = await (await POST(req())).json();
    expect(body.errors.some((e: { subscriptionId: string }) => e.subscriptionId === sub.stripe_subscription_id)).toBe(true);
  });
});
