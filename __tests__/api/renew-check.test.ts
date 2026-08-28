/**
 * Integration tests for POST /api/renew-check (Track E1).
 *
 * Tests cover:
 *   - Auth enforcement
 *   - Payment-method guard: no default_payment_method -> skipped, no invoice
 *   - Happy path: pause cleared, flat-amount invoiceItem + invoice created
 *   - Per-member error isolation: one Stripe failure doesn't stop the batch
 *   - Members with balance > 0 are never candidates at all
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { seedMember, seedSubscription, cleanupMember } from "@tests/helpers";
import { POST } from "@/app/api/renew-check/route";

// --- Mocks ---

const { mockRetrieve, mockUpdate, mockInvoiceItemCreate, mockInvoiceCreate } = vi.hoisted(() => ({
  mockRetrieve: vi.fn(),
  mockUpdate: vi.fn().mockResolvedValue({}),
  mockInvoiceItemCreate: vi.fn().mockResolvedValue({}),
  mockInvoiceCreate: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    subscriptions: { retrieve: mockRetrieve, update: mockUpdate },
    invoiceItems: { create: mockInvoiceItemCreate },
    invoices: { create: mockInvoiceCreate },
  }),
}));

const BASE_URL = "http://localhost";

function makeRequest(bearer?: string) {
  const secret = bearer ?? process.env.MATCHER_API_SECRET;
  return new NextRequest(`${BASE_URL}/api/renew-check`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
}

function stripeSubResponse(overrides: {
  hasPaymentMethod?: boolean;
  unitAmount?: number | null;
  currency?: string;
} = {}) {
  const { hasPaymentMethod = true, unitAmount = 1200, currency = "eur" } = overrides;
  return {
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
      invoice_settings: {
        default_payment_method: hasPaymentMethod ? "pm_test_123" : null,
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
});
