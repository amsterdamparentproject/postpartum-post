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

  beforeEach(() => {
    mockRetrieve.mockReset();
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
    mockRetrieve.mockResolvedValue(stripeSubResponse({ hasPaymentMethod: false }));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skippedNoPaymentMethod).toBe(1);
    expect(body.billed).toBe(0);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockInvoiceItemCreate).not.toHaveBeenCalled();
    expect(mockInvoiceCreate).not.toHaveBeenCalled();
    void sub;
  });

  it("clears pause_collection and submits a flat-amount invoice for an eligible member", async () => {
    const member = await seedMember({ status: "active", matches_remaining: 0 });
    memberId = member.id;
    const sub = await seedSubscription(memberId, { status: "active" });
    mockRetrieve.mockResolvedValue(stripeSubResponse({ unitAmount: 2400, currency: "eur" }));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.billed).toBe(1);
    expect(body.skippedNoPaymentMethod).toBe(0);
    expect(body.errors).toHaveLength(0);

    expect(mockUpdate).toHaveBeenCalledWith(sub.stripe_subscription_id, { pause_collection: null });
    expect(mockInvoiceItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_test",
        subscription: sub.stripe_subscription_id,
        amount: 2400,
        currency: "eur",
      })
    );
    expect(mockInvoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_test",
        subscription: sub.stripe_subscription_id,
        auto_advance: true,
      })
    );
  });

  it("never touches a member who still has balance — not a candidate at all", async () => {
    const member = await seedMember({ status: "active", matches_remaining: 2 });
    memberId = member.id;
    await seedSubscription(memberId, { status: "active" });
    mockRetrieve.mockResolvedValue(stripeSubResponse());

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checked).toBe(0);
    expect(body.billed).toBe(0);
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  it("isolates a per-member Stripe failure — records the error without failing the batch", async () => {
    const member = await seedMember({ status: "active", matches_remaining: 0 });
    memberId = member.id;
    await seedSubscription(memberId, { status: "active" });
    mockRetrieve.mockRejectedValue(new Error("stripe unavailable"));

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.billed).toBe(0);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].memberId).toBe(member.id);
    expect(body.errors[0].error).toContain("stripe unavailable");
  });

  it("skips a member with no live subscription row — no error, just no-op", async () => {
    const member = await seedMember({ status: "active", matches_remaining: 0 });
    memberId = member.id;
    // No seedSubscription() — member has no subscription row at all

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.billed).toBe(0);
    expect(body.errors).toHaveLength(0);
    expect(mockRetrieve).not.toHaveBeenCalled();
  });
});
