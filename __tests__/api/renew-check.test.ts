/**
 * Integration tests for POST /api/renew-check (Track E1).
 *
 * Tests cover:
 *   - { dryRun: true } body: same checks, zero Stripe writes, per-member
 *     details; any ambiguous dry-run flag is a 400, never a real run
 *   - Auth enforcement
 *   - Payment-method guard: no default_payment_method -> skipped, no invoice
 *   - Payment-method guard checks the subscription-level default_payment_method
 *     too, not just the customer's invoice_settings — real Checkout-created
 *     subscriptions carry the card there (bug found 2026-09-11 against live
 *     Stripe data: real paying members were being skipped as if comped)
 *   - Happy path: pause cleared, flat-amount invoiceItem + invoice created
 *   - In-flight guard: latest invoice still open -> skipped and reported, no
 *     second invoice stacked on an unsettled payment
 *   - Per-member error isolation: one Stripe failure doesn't stop the batch
 *   - Members with balance > 0 are never candidates at all
 *   - A "canceling" member at zero gets their cancellation finalized
 *     (subscriptions.cancel) instead of billed — they already declined to
 *     renew, so a fresh charge would silently override that decision.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { seedMember, seedSubscription, cleanupMember, createTestSupabase } from "@tests/helpers";
import { POST } from "@/app/api/renew-check/route";

// --- Mocks ---

const { mockRetrieve, mockUpdate, mockCancel, mockInvoiceItemCreate, mockInvoiceCreate } = vi.hoisted(() => ({
  mockRetrieve: vi.fn(),
  mockUpdate: vi.fn().mockResolvedValue({}),
  mockCancel: vi.fn().mockResolvedValue({}),
  mockInvoiceItemCreate: vi.fn().mockResolvedValue({}),
  mockInvoiceCreate: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    subscriptions: { retrieve: mockRetrieve, update: mockUpdate, cancel: mockCancel },
    invoiceItems: { create: mockInvoiceItemCreate },
    invoices: { create: mockInvoiceCreate },
  }),
}));

const BASE_URL = "http://localhost";

function makeRequest(bearer?: string, opts: { query?: string; body?: string } = {}) {
  const secret = bearer ?? process.env.MATCHER_API_SECRET;
  return new NextRequest(`${BASE_URL}/api/renew-check${opts.query ?? ""}`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    ...(opts.body !== undefined ? { body: opts.body } : {}),
  });
}

function stripeSubResponse(overrides: {
  hasPaymentMethod?: boolean;
  // Independent overrides for the subscription-level vs customer-level
  // default_payment_method — undefined means "fall back to hasPaymentMethod".
  // Lets tests reproduce the real-world case where the card lives on the
  // subscription but not on the customer's invoice_settings.
  subscriptionDefaultPaymentMethod?: string | null;
  customerDefaultPaymentMethod?: string | null;
  unitAmount?: number | null;
  currency?: string;
  // The expanded latest_invoice; undefined means none (a fresh/settled sub).
  latestInvoice?: { id: string; status: string } | null;
} = {}) {
  const { hasPaymentMethod = true, unitAmount = 1200, currency = "eur" } = overrides;
  const fallbackPm = hasPaymentMethod ? "pm_test_123" : null;
  const subscriptionDefaultPaymentMethod =
    overrides.subscriptionDefaultPaymentMethod !== undefined
      ? overrides.subscriptionDefaultPaymentMethod
      : fallbackPm;
  const customerDefaultPaymentMethod =
    overrides.customerDefaultPaymentMethod !== undefined
      ? overrides.customerDefaultPaymentMethod
      : fallbackPm;
  return {
    default_payment_method: subscriptionDefaultPaymentMethod,
    latest_invoice: overrides.latestInvoice ?? null,
    items: {
      data: [
        {
          price: { unit_amount: unitAmount, currency },
        },
      ],
    },
    customer: {
      id: "cus_test",
      deleted: false,
      default_source: null,
      invoice_settings: {
        default_payment_method: customerDefaultPaymentMethod,
      },
    },
  };
}

describe("POST /api/renew-check", () => {
  let memberId: string;

  // .env.test and .env.local point at the same Supabase project (no
  // separate test DB), and scripts/test-quiet.sh reseeds a set of real
  // reference members after every run — some of which may legitimately sit
  // at matches_remaining <= 0. This route's candidate query is intentionally
  // unscoped (it mirrors the real cron job), so those reference members show
  // up as extra candidates alongside whatever this file seeds. mockRetrieve
  // defaults to a safe, fully-eligible response for any subscription id it
  // doesn't recognize, so those extra candidates get billed quietly instead
  // of crashing on an unmocked call — every assertion below is scoped to
  // this test's own member/subscription id rather than global response
  // counts, so it doesn't care how many other candidates exist.
  beforeEach(() => {
    mockRetrieve.mockReset().mockResolvedValue(stripeSubResponse());
    mockUpdate.mockReset().mockResolvedValue({});
    mockCancel.mockReset().mockResolvedValue({});
    mockInvoiceItemCreate.mockReset().mockResolvedValue({});
    mockInvoiceCreate.mockReset().mockResolvedValue({});
  });

  afterEach(async () => {
    if (memberId) {
      await cleanupMember(memberId);
      memberId = "";
    }
  });

  it("rejects a request with the wrong bearer token", async () => {
    const res = await POST(makeRequest("wrong-secret"));
    expect(res.status).toBe(401);
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  it("skips a member with no default_payment_method — no pause, no invoice", async () => {
    const member = await seedMember({ status: "active", matches_remaining: 0 });
    memberId = member.id;
    const sub = await seedSubscription(memberId, { status: "active" });
    mockRetrieve.mockImplementation(async (subId: string) =>
      subId === sub.stripe_subscription_id
        ? stripeSubResponse({ hasPaymentMethod: false })
        : stripeSubResponse()
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skippedNoPaymentMethod).toBeGreaterThanOrEqual(1);

    expect(mockUpdate).not.toHaveBeenCalledWith(sub.stripe_subscription_id, expect.anything());
    expect(mockInvoiceItemCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({ subscription: sub.stripe_subscription_id })
    );
    expect(mockInvoiceCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({ subscription: sub.stripe_subscription_id })
    );
  });

  it("skips a member whose latest invoice is still open (payment in flight) — no pause, no second invoice", async () => {
    // Regression test for the 2026-10-05 case: a SEPA debit from Stripe's own
    // cycle was still processing when renew-check found the member at zero,
    // so a second charge would have stacked on the first before its credit
    // landed. Reported, not billed; the next run picks them up if still at 0.
    const member = await seedMember({ status: "active", matches_remaining: 0 });
    memberId = member.id;
    const sub = await seedSubscription(memberId, { status: "active" });
    mockRetrieve.mockImplementation(async (subId: string) =>
      subId === sub.stripe_subscription_id
        ? stripeSubResponse({ latestInvoice: { id: "in_open_123", status: "open" } })
        : stripeSubResponse()
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skippedOpenInvoice).toBeGreaterThanOrEqual(1);
    expect(body.errors.find((e: { memberId: string }) => e.memberId === member.id)).toBeUndefined();

    expect(mockUpdate).not.toHaveBeenCalledWith(sub.stripe_subscription_id, expect.anything());
    expect(mockInvoiceItemCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({ subscription: sub.stripe_subscription_id }),
      expect.anything()
    );
    expect(mockInvoiceCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({ subscription: sub.stripe_subscription_id }),
      expect.anything()
    );
  });

  it("still bills a member whose latest invoice is paid", async () => {
    const member = await seedMember({ status: "active", matches_remaining: 0 });
    memberId = member.id;
    const sub = await seedSubscription(memberId, { status: "active" });
    mockRetrieve.mockImplementation(async (subId: string) =>
      subId === sub.stripe_subscription_id
        ? stripeSubResponse({ latestInvoice: { id: "in_paid_123", status: "paid" } })
        : stripeSubResponse()
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockInvoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({ subscription: sub.stripe_subscription_id }),
      expect.anything()
    );
  });

  it("bills a member whose card lives on the subscription, not the customer's invoice_settings", async () => {
    // Regression test for the 2026-09-11 bug: real Checkout-created
    // subscriptions carry the card on subscription.default_payment_method,
    // not customer.invoice_settings.default_payment_method. The guard must
    // check both (Stripe's own fallback order for automatic collection),
    // or it wrongly treats every real paying member as if comped.
    const member = await seedMember({ status: "active", matches_remaining: 0 });
    memberId = member.id;
    const sub = await seedSubscription(memberId, { status: "active" });
    mockRetrieve.mockImplementation(async (subId: string) =>
      subId === sub.stripe_subscription_id
        ? stripeSubResponse({ subscriptionDefaultPaymentMethod: "pm_test_123", customerDefaultPaymentMethod: null })
        : stripeSubResponse()
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.errors.find((e: { memberId: string }) => e.memberId === member.id)).toBeUndefined();

    expect(mockUpdate).toHaveBeenCalledWith(sub.stripe_subscription_id, { pause_collection: null });
    expect(mockInvoiceItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({ subscription: sub.stripe_subscription_id }),
      expect.anything()
    );
    expect(mockInvoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({ subscription: sub.stripe_subscription_id }),
      expect.anything()
    );
  });

  it("clears pause_collection and submits a flat-amount invoice for an eligible member", async () => {
    const member = await seedMember({ status: "active", matches_remaining: 0 });
    memberId = member.id;
    const sub = await seedSubscription(memberId, { status: "active" });
    mockRetrieve.mockImplementation(async (subId: string) =>
      subId === sub.stripe_subscription_id
        ? stripeSubResponse({ unitAmount: 2400, currency: "eur" })
        : stripeSubResponse()
    );

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.billed).toBeGreaterThanOrEqual(1);
    expect(body.errors.find((e: { memberId: string }) => e.memberId === member.id)).toBeUndefined();

    expect(mockUpdate).toHaveBeenCalledWith(sub.stripe_subscription_id, { pause_collection: null });
    // Idempotency keys (retry-safety, see the route's docblock): scoped to
    // member + calendar month, distinct per Stripe call, so a retry within
    // the same billing cycle can't double-invoice.
    const cycleKey = new Date().toISOString().slice(0, 7);
    expect(mockInvoiceItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_test",
        subscription: sub.stripe_subscription_id,
        amount: 2400,
        currency: "eur",
      }),
      { idempotencyKey: `renew-check-item-${member.id}-${cycleKey}` }
    );
    expect(mockInvoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_test",
        subscription: sub.stripe_subscription_id,
        auto_advance: true,
      }),
      { idempotencyKey: `renew-check-invoice-${member.id}-${cycleKey}` }
    );
  });

  it("reuses the same idempotency key on a retry within the same billing cycle", async () => {
    const member = await seedMember({ status: "active", matches_remaining: 0 });
    memberId = member.id;
    const sub = await seedSubscription(memberId, { status: "active" });

    await POST(makeRequest());
    await POST(makeRequest());

    const itemKeys = mockInvoiceItemCreate.mock.calls
      .filter((call) => call[0].subscription === sub.stripe_subscription_id)
      .map((call) => call[1].idempotencyKey);
    const invoiceKeys = mockInvoiceCreate.mock.calls
      .filter((call) => call[0].subscription === sub.stripe_subscription_id)
      .map((call) => call[1].idempotencyKey);

    expect(itemKeys).toHaveLength(2);
    expect(itemKeys[0]).toBe(itemKeys[1]);
    expect(invoiceKeys).toHaveLength(2);
    expect(invoiceKeys[0]).toBe(invoiceKeys[1]);
  });

  it("never touches a member who still has balance — not a candidate at all", async () => {
    const member = await seedMember({ status: "active", matches_remaining: 2 });
    memberId = member.id;
    const sub = await seedSubscription(memberId, { status: "active" });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.errors.find((e: { memberId: string }) => e.memberId === member.id)).toBeUndefined();
    expect(mockRetrieve).not.toHaveBeenCalledWith(sub.stripe_subscription_id, expect.anything());
    expect(mockUpdate).not.toHaveBeenCalledWith(sub.stripe_subscription_id, expect.anything());
  });

  it("finalizes the cancellation for a canceling member at zero — no bill, just cancel()", async () => {
    const member = await seedMember({ status: "canceling", matches_remaining: 0 });
    memberId = member.id;
    const sub = await seedSubscription(memberId, { status: "active" });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canceled).toBeGreaterThanOrEqual(1);
    expect(body.errors.find((e: { memberId: string }) => e.memberId === member.id)).toBeUndefined();

    // invoice_now/prorate must be explicit — Stripe's cancel endpoint can
    // otherwise generate its own final invoice as a side effect of
    // cancellation (caught for real against Stripe test mode via
    // scripts/smoketest-renew-check.mts; this mock alone wouldn't have).
    expect(mockCancel).toHaveBeenCalledWith(sub.stripe_subscription_id, {
      invoice_now: false,
      prorate: false,
    });
    // Never billed — a canceling member already declined to renew.
    expect(mockUpdate).not.toHaveBeenCalledWith(sub.stripe_subscription_id, expect.anything());
    expect(mockInvoiceItemCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({ subscription: sub.stripe_subscription_id })
    );
    expect(mockInvoiceCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({ subscription: sub.stripe_subscription_id })
    );
  });

  it("defers finalizing a canceling member at zero who has a match this month", async () => {
    // Used their last match in this month's round: the 10th must not send
    // "sorry to see you go" while they still have a live match to meet.
    const member = await seedMember({ status: "canceling", matches_remaining: 0 });
    memberId = member.id;
    const partner = await seedMember({ status: "active", matches_remaining: 2 });
    const sub = await seedSubscription(memberId, { status: "active" });
    const monthDate = `${new Date().toISOString().slice(0, 7)}-01`;
    try {
      const { error } = await createTestSupabase()
        .from("matches")
        .insert({ member_id_1: member.id, member_id_2: partner.id, matched_on: monthDate });
      expect(error).toBeNull();

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.deferredActiveMatch).toBeGreaterThanOrEqual(1);
      expect(body.errors.find((e: { memberId: string }) => e.memberId === member.id)).toBeUndefined();

      // Not cancelled, not billed.
      expect(mockCancel).not.toHaveBeenCalledWith(sub.stripe_subscription_id, expect.anything());
      expect(mockUpdate).not.toHaveBeenCalledWith(sub.stripe_subscription_id, expect.anything());
    } finally {
      await cleanupMember(partner.id);
    }
  });

  it("still finalizes a canceling member at zero whose only match was in an earlier month", async () => {
    const member = await seedMember({ status: "canceling", matches_remaining: 0 });
    memberId = member.id;
    const partner = await seedMember({ status: "active", matches_remaining: 2 });
    const sub = await seedSubscription(memberId, { status: "active" });
    const lastMonth = new Date();
    lastMonth.setUTCDate(1);
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
    const lastMonthDate = `${lastMonth.toISOString().slice(0, 7)}-01`;
    try {
      const { error } = await createTestSupabase()
        .from("matches")
        .insert({ member_id_1: member.id, member_id_2: partner.id, matched_on: lastMonthDate });
      expect(error).toBeNull();

      const res = await POST(makeRequest());
      expect(res.status).toBe(200);
      expect(mockCancel).toHaveBeenCalledWith(sub.stripe_subscription_id, {
        invoice_now: false,
        prorate: false,
      });
    } finally {
      await cleanupMember(partner.id);
    }
  });

  it("isolates a per-member Stripe failure — records the error without failing the batch", async () => {
    const member = await seedMember({ status: "active", matches_remaining: 0 });
    memberId = member.id;
    const sub = await seedSubscription(memberId, { status: "active" });
    mockRetrieve.mockImplementation(async (subId: string) => {
      if (subId === sub.stripe_subscription_id) throw new Error("stripe unavailable");
      return stripeSubResponse();
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.errors).toContainEqual(
      expect.objectContaining({ memberId: member.id, error: expect.stringContaining("stripe unavailable") })
    );
    expect(mockUpdate).not.toHaveBeenCalledWith(sub.stripe_subscription_id, expect.anything());
  });

  it("skips a member with no live subscription row — no error, just no-op", async () => {
    const member = await seedMember({ status: "active", matches_remaining: 0 });
    memberId = member.id;
    // No seedSubscription() — member has no subscription row at all

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.errors.find((e: { memberId: string }) => e.memberId === member.id)).toBeUndefined();
  });

  const DRY = JSON.stringify({ dryRun: true });

  describe("dry run ({ dryRun: true } body)", () => {
    it("reports what would happen for an eligible member without a single Stripe write", async () => {
      const member = await seedMember({ status: "active", matches_remaining: 0 });
      memberId = member.id;
      const sub = await seedSubscription(memberId, { status: "active" });
      mockRetrieve.mockImplementation(async (subId: string) =>
        subId === sub.stripe_subscription_id
          ? stripeSubResponse({ unitAmount: 2400, currency: "eur" })
          : stripeSubResponse()
      );

      const res = await POST(makeRequest(undefined, { body: DRY }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.dryRun).toBe(true);
      expect(body.details).toContainEqual(
        expect.objectContaining({
          memberId: member.id,
          status: "active",
          wouldDo: "billed",
          amount: 24,
          currency: "eur",
        })
      );

      // Not one write — across every candidate, not just this member.
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockInvoiceItemCreate).not.toHaveBeenCalled();
      expect(mockInvoiceCreate).not.toHaveBeenCalled();
      expect(mockCancel).not.toHaveBeenCalled();
    });

    it("still applies the payment-method guard", async () => {
      const member = await seedMember({ status: "active", matches_remaining: 0 });
      memberId = member.id;
      const sub = await seedSubscription(memberId, { status: "active" });
      mockRetrieve.mockImplementation(async (subId: string) =>
        subId === sub.stripe_subscription_id
          ? stripeSubResponse({ hasPaymentMethod: false })
          : stripeSubResponse()
      );

      const res = await POST(makeRequest(undefined, { body: DRY }));
      const body = await res.json();
      expect(body.details).toContainEqual(
        expect.objectContaining({ memberId: member.id, wouldDo: "skipped_no_payment_method" })
      );
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("reports a canceling member as would-cancel without cancelling", async () => {
      const member = await seedMember({ status: "canceling", matches_remaining: 0 });
      memberId = member.id;
      await seedSubscription(memberId, { status: "active" });

      const res = await POST(makeRequest(undefined, { body: DRY }));
      const body = await res.json();
      expect(body.details).toContainEqual(
        expect.objectContaining({ memberId: member.id, status: "canceling", wouldDo: "canceled" })
      );
      expect(mockCancel).not.toHaveBeenCalled();
    });

    it.each([
      ["a query-string flag", { query: "?dryRun=true" }],
      ["a misspelled key", { body: '{"dryrun":true}' }],
      ["an underscore key", { body: '{"dry_run":true}' }],
      ["a string value", { body: '{"dryRun":"true"}' }],
      ["a numeric value", { body: '{"dryRun":1}' }],
      ["malformed JSON", { body: '{"dryRun":true' }],
      ["a non-object body", { body: "true" }],
    ])("rejects %s with 400 instead of running for real", async (_label, opts) => {
      const res = await POST(makeRequest(undefined, opts));
      expect(res.status).toBe(400);
      expect(mockRetrieve).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockInvoiceCreate).not.toHaveBeenCalled();
      expect(mockCancel).not.toHaveBeenCalled();
    });

    it("treats { dryRun: false } as a real run", async () => {
      const res = await POST(makeRequest(undefined, { body: '{"dryRun":false}' }));
      expect(res.status).toBe(200);
      expect((await res.json()).dryRun).toBe(false);
    });

    it("an empty-body run is a real run: dryRun false, no details", async () => {
      const res = await POST(makeRequest());
      const body = await res.json();
      expect(body.dryRun).toBe(false);
      expect(body.details).toBeUndefined();
    });
  });
});
