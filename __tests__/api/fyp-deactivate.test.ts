/**
 * Integration tests for POST /api/fyp/deactivate
 *
 * Real test Supabase DB (postpartumpost schema), mocked Stripe — mirrors
 * the convention in fyp-activate.test.ts.
 *
 * Covers:
 *   - Auth enforcement
 *   - Member with an active subscription -> discount removed via
 *     stripe.subscriptions.update(id, { discounts: "" })
 *   - Member with no active subscription -> no-op, still 200
 *   - Missing/invalid body -> 400
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { seedMember, seedSubscription, cleanupMember } from "@tests/helpers";
import { POST } from "@/app/api/fyp/deactivate/route";

const { mockSubscriptionsUpdate } = vi.hoisted(() => ({
  mockSubscriptionsUpdate: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    subscriptions: { update: mockSubscriptionsUpdate },
  }),
}));

const SECRET = "test-fyp-deactivate-secret";

function makeRequest(
  body: Record<string, unknown> = {},
  authSecret: string | null = SECRET,
) {
  return new NextRequest("http://localhost/api/fyp/deactivate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...(authSecret ? { authorization: `Bearer ${authSecret}` } : {}),
    },
  });
}

describe("POST /api/fyp/deactivate", () => {
  let memberId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FYP_DEACTIVATE_API_SECRET = SECRET;
    mockSubscriptionsUpdate.mockResolvedValue({});
  });

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
    memberId = "";
  });

  it("rejects a request with no Authorization header", async () => {
    const res = await POST(
      makeRequest({ postpartumpostMemberId: "whatever" }, null),
    );
    expect(res.status).toBe(401);
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong secret", async () => {
    const res = await POST(
      makeRequest({ postpartumpostMemberId: "whatever" }, "wrong-secret"),
    );
    expect(res.status).toBe(401);
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
  });

  it("rejects a request missing postpartumpostMemberId", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("removes the discount from the member's active subscription", async () => {
    const member = await seedMember();
    memberId = member.id;
    const sub = await seedSubscription(member.id, {
      stripe_subscription_id: "sub_to_deactivate",
    });

    const res = await POST(makeRequest({ postpartumpostMemberId: member.id }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith(
      sub.stripe_subscription_id,
      { discounts: "" },
    );
  });

  it("is a no-op (still 200) for a member with no active subscription", async () => {
    const member = await seedMember();
    memberId = member.id;
    // No seedSubscription call — this member has no subscriptions row.

    const res = await POST(makeRequest({ postpartumpostMemberId: member.id }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
  });

  it("is a no-op for an unknown member id", async () => {
    const res = await POST(
      makeRequest({
        postpartumpostMemberId: "00000000-0000-0000-0000-000000000000",
      }),
    );
    expect(res.status).toBe(200);
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
  });

  it("returns 500 if the Stripe update call fails", async () => {
    const member = await seedMember();
    memberId = member.id;
    await seedSubscription(member.id, {
      stripe_subscription_id: "sub_will_fail",
    });
    mockSubscriptionsUpdate.mockRejectedValue(new Error("Stripe error"));

    const res = await POST(makeRequest({ postpartumpostMemberId: member.id }));
    expect(res.status).toBe(500);
  });
});
