import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { seedMember, cleanupMember, createTestSupabase } from "@tests/helpers";
import { POST } from "@/app/api/webhooks/stripe/route";
import { sendWelcomeEmail, sendGiftCardEmail } from "@/lib/emails";

// --- Mocks ---

const { mockConstructEvent, mockRetrieve, mockUpdate, mockCreateCoupon, mockCreatePromotionCode, mockRetrievePrice } = vi.hoisted(() => ({
  mockConstructEvent: vi.fn(),
  mockRetrieve: vi.fn(),
  mockUpdate: vi.fn().mockResolvedValue({}),
  mockCreateCoupon: vi.fn().mockResolvedValue({ id: "coupon_test" }),
  mockCreatePromotionCode: vi.fn().mockResolvedValue({ id: "promo_test" }),
  mockRetrievePrice: vi.fn().mockResolvedValue({ product: "prod_test" }),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockRetrieve, update: mockUpdate },
    coupons: { create: mockCreateCoupon },
    promotionCodes: { create: mockCreatePromotionCode },
    prices: { retrieve: mockRetrievePrice },
  }),
}));

vi.mock("@/lib/emails", () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  sendUnsubscribedEmail: vi.fn().mockResolvedValue(undefined),
  sendGiftCardEmail: vi.fn().mockResolvedValue(undefined),
}));

// Helper — construct a minimal NextRequest with a fake stripe-signature header
function makeRequest(body: string) {
  return new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body,
    headers: { "stripe-signature": "test_sig" },
  });
}

describe("Stripe webhook", () => {
  let memberId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue({});
    mockRetrievePrice.mockResolvedValue({ product: "prod_test" });
  });

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
    memberId = "";
  });

  it("sets member status to active and creates a subscription row on checkout.session.completed", async () => {
    const member = await seedMember({ status: "pending" });
    memberId = member.id;

    mockRetrieve.mockResolvedValue({
      items: { data: [{ price: { id: "price_test_monthly" } }] },
    });

    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { member_id: memberId },
          customer_details: { email: member.email, name: "Test Member" },
          subscription: `sub_test_${memberId.slice(0, 8)}`,
        },
      },
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);

    const supabase = createTestSupabase();

    const { data: updatedMember } = await supabase
      .from("members")
      .select("status")
      .eq("id", memberId)
      .single();
    expect(updatedMember?.status).toBe("active");

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("status, stripe_price_id")
      .eq("member_id", memberId)
      .single();
    expect(sub?.status).toBe("active");
    expect(sub?.stripe_price_id).toBe("price_test_monthly");
  });

  // ── Plan label tests ────────────────────────────────────────────────────

  function makeCheckoutEvent(memberId: string, email: string, lookupKey: string) {
    mockRetrieve.mockResolvedValue({
      items: { data: [{ price: { id: "price_test", lookup_key: lookupKey } }] },
      latest_invoice: { period_end: 1780000000 },
      billing_cycle_anchor: 1780000000,
    });
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { member_id: memberId },
          customer_details: { email, name: "Test Member" },
          subscription: `sub_test_${memberId.slice(0, 8)}`,
        },
      },
    });
  }

  it("sends welcome email with 'Founding Member (€5/mo)' label for founding member subscribers", async () => {
    const member = await seedMember({ status: "pending" });
    memberId = member.id;

    makeCheckoutEvent(memberId, member.email, "founding_member");

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);

    expect(sendWelcomeEmail).toHaveBeenCalledWith(
      member.email,
      expect.any(String),
      expect.any(String),
      "Founding Member (€5/mo)",
      expect.any(String)
    );
  });

  it("sends welcome email with '3-month commitment (€8/mo)' label for regular 3-month subscribers", async () => {
    const member = await seedMember({ status: "pending" });
    memberId = member.id;

    makeCheckoutEvent(memberId, member.email, "commitment_3mo");

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);

    expect(sendWelcomeEmail).toHaveBeenCalledWith(
      member.email,
      expect.any(String),
      expect.any(String),
      "3-month commitment (€8/mo)",
      expect.any(String)
    );
  });

  it("sends welcome email with 'Monthly (€12/mo)' label for monthly subscribers", async () => {
    const member = await seedMember({ status: "pending" });
    memberId = member.id;

    makeCheckoutEvent(memberId, member.email, "standard_monthly");

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);

    expect(sendWelcomeEmail).toHaveBeenCalledWith(
      member.email,
      expect.any(String),
      expect.any(String),
      "Monthly (€12/mo)",
      expect.any(String)
    );
  });

  // ── Billing extension tests ──────────────────────────────────────────────

  it.each([
    // June 1: next match July 5 (different month) → extend
    ["June 1",    "2026-06-01T00:00:00Z", "2026-07-05T00:00:00Z", true],
    // August 4: next match August 5 (same month) → no extension
    ["August 4",  "2026-08-04T00:00:00Z", null, false],
    // August 20: next match September 5 (different month) → extend
    ["August 20", "2026-08-20T00:00:00Z", "2026-09-05T00:00:00Z", true],
  ])(
    "billing extension on %s signup: extends=%s",
    async (_label, signupDate, expectedTrialEnd, shouldExtend) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(signupDate));

      try {
        const member = await seedMember({ status: "pending" });
        memberId = member.id;
        makeCheckoutEvent(memberId, member.email, "commitment_3mo");

        const res = await POST(makeRequest("{}"));
        expect(res.status).toBe(200);

        if (shouldExtend) {
          const expected = Math.floor(new Date(expectedTrialEnd!).getTime() / 1000);
          expect(mockUpdate).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
              trial_end: expected,
              proration_behavior: "none",
            })
          );
        } else {
          expect(mockUpdate).not.toHaveBeenCalled();
        }
      } finally {
        vi.useRealTimers();
      }
    }
  );

  // ── Gift card routing test ───────────────────────────────────────────────

  it("does not invoke gift card logic for a regular subscription checkout", async () => {
    const member = await seedMember({ status: "pending" });
    memberId = member.id;

    mockRetrieve.mockResolvedValue({
      items: { data: [{ price: { id: "price_test_monthly", lookup_key: "standard_monthly" } }] },
      latest_invoice: { period_end: 1780000000 },
      billing_cycle_anchor: 1780000000,
    });
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { member_id: member.id },
          customer_details: { email: member.email, name: "Test Member" },
          subscription: `sub_test_${member.id.slice(0, 8)}`,
        },
      },
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);

    expect(mockCreateCoupon).not.toHaveBeenCalled();
    expect(mockCreatePromotionCode).not.toHaveBeenCalled();
    expect(sendGiftCardEmail).not.toHaveBeenCalled();
  });

  // ── Gift card e2e tests ──────────────────────────────────────────────────

  it("creates a gift_cards row and emails the recipient on gift card purchase", async () => {
    const promoCodeId = `promo_gc_${crypto.randomUUID().slice(0, 8)}`;
    const supabase = createTestSupabase();

    mockCreateCoupon.mockResolvedValue({ id: "coupon_gc_test", metadata: { product: "gift_card" } });
    mockCreatePromotionCode.mockResolvedValue({ id: promoCodeId });

    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { product: "gift_card", gift_months: "3" },
          customer_details: { email: "buyer@example.com" },
          custom_fields: [{ key: "recipientsemail", text: { value: "recipient@example.com" } }],
        },
      },
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);

    const { data: card } = await supabase
      .from("gift_cards")
      .select("*")
      .eq("stripe_promotion_code_id", promoCodeId)
      .single();

    expect(card?.buyer_email).toBe("buyer@example.com");
    expect(card?.recipient_email).toBe("recipient@example.com");
    expect(card?.gift_months).toBe(3);
    expect(card?.redeemed_at).toBeNull();
    expect(sendGiftCardEmail).toHaveBeenCalledWith("recipient@example.com", card?.code, 3);

    await supabase.from("gift_cards").delete().eq("stripe_promotion_code_id", promoCodeId);
  });

  it("marks the gift_cards row as redeemed when a subscriber applies the code at checkout", async () => {
    const promoCodeId = `promo_gc_${crypto.randomUUID().slice(0, 8)}`;
    const supabase = createTestSupabase();

    await supabase.from("gift_cards").insert({
      code: `PP-${promoCodeId.slice(-8).toUpperCase()}`,
      stripe_coupon_id: "coupon_gc_test",
      stripe_promotion_code_id: promoCodeId,
      buyer_email: "buyer@example.com",
      recipient_email: "recipient@example.com",
      gift_months: 3,
    });

    const member = await seedMember({ status: "pending" });
    memberId = member.id;

    mockRetrieve.mockResolvedValue({
      items: { data: [{ price: { id: "price_test_3mo", lookup_key: "commitment_3mo" } }] },
      latest_invoice: { period_end: 1780000000 },
      billing_cycle_anchor: 1780000000,
      discounts: [{ promotion_code: promoCodeId }],
    });

    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { member_id: memberId },
          customer_details: { email: member.email, name: "Test Member" },
          subscription: `sub_test_${memberId.slice(0, 8)}`,
        },
      },
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);

    const { data: card } = await supabase
      .from("gift_cards")
      .select("redeemed_at")
      .eq("stripe_promotion_code_id", promoCodeId)
      .single();

    expect(card?.redeemed_at).not.toBeNull();

    await supabase.from("gift_cards").delete().eq("stripe_promotion_code_id", promoCodeId);
  });

  // ── Cancellation tests ───────────────────────────────────────────────────

  it("sets subscription status to canceled on customer.subscription.deleted", async () => {
    const member = await seedMember();
    memberId = member.id;

    const supabase = createTestSupabase();
    const stripeSubId = `sub_test_${memberId.slice(0, 8)}`;
    await supabase.from("subscriptions").insert({
      member_id: memberId,
      stripe_subscription_id: stripeSubId,
      stripe_price_id: "price_test_monthly",
      status: "active",
    });

    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: stripeSubId,
          customer: member.stripe_customer_id,
        },
      },
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("stripe_subscription_id", stripeSubId)
      .single();
    expect(sub?.status).toBe("canceled");
  });

  it("sets member status to 'inactive' when their billing period expires (customer.subscription.deleted)", async () => {
    // Simulate a member who canceled but was still in the 'canceling' state
    // while their paid period ran out. The webhook is the only thing that
    // transitions them to 'inactive'.
    const member = await seedMember({ status: "canceling" });
    memberId = member.id;

    const supabase = createTestSupabase();
    const stripeSubId = `sub_test_${memberId.slice(0, 8)}`;
    await supabase.from("subscriptions").insert({
      member_id: memberId,
      stripe_subscription_id: stripeSubId,
      stripe_price_id: "price_test_monthly",
      status: "active",
    });

    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: stripeSubId,
          customer: member.stripe_customer_id,
        },
      },
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);

    const { data: updatedMember } = await supabase
      .from("members")
      .select("status")
      .eq("id", memberId)
      .single();
    expect(updatedMember?.status).toBe("inactive");
  });
});
