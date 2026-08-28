import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { seedMember, cleanupMember, createTestSupabase } from "@tests/helpers";
import { POST } from "@/app/api/webhooks/stripe/route";
import { sendWelcomeEmail, sendGiftCardEmail } from "@/lib/emails";

// --- Mocks ---

const { mockConstructEvent, mockRetrieve, mockUpdate, mockCreateCoupon, mockRetrieveCoupon, mockCreatePromotionCode, mockRetrievePrice } = vi.hoisted(() => ({
  mockConstructEvent: vi.fn(),
  mockRetrieve: vi.fn(),
  mockUpdate: vi.fn().mockResolvedValue({}),
  mockCreateCoupon: vi.fn().mockResolvedValue({ id: "coupon_test" }),
  mockRetrieveCoupon: vi.fn(),
  mockCreatePromotionCode: vi.fn().mockResolvedValue({ id: "promo_test" }),
  mockRetrievePrice: vi.fn().mockResolvedValue({ product: "prod_test" }),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockRetrieve, update: mockUpdate },
    coupons: { create: mockCreateCoupon, retrieve: mockRetrieveCoupon },
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
    mockRetrieveCoupon.mockReset();
  });

  afterEach(async () => {
    if (memberId) await cleanupMember(memberId);
    memberId = "";
  });

  it("sets member status to active and creates a subscription row on checkout.session.completed", async () => {
    const member = await seedMember({ status: "pending" });
    memberId = member.id;

    mockRetrieve.mockResolvedValue({
      items: {
        data: [
          {
            price: { id: "price_test_monthly" },
            current_period_end: Math.floor(new Date("2026-09-05T00:00:00Z").getTime() / 1000),
          },
        ],
      },
      metadata: {},
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

  function makeCheckoutEvent(
    memberId: string,
    email: string,
    lookupKey: string,
    currentPeriodEndISO: string = "2026-09-05T00:00:00Z"
  ) {
    mockRetrieve.mockResolvedValue({
      items: {
        data: [
          {
            price: { id: "price_test", lookup_key: lookupKey },
            current_period_end: Math.floor(new Date(currentPeriodEndISO).getTime() / 1000),
          },
        ],
      },
      metadata: {},
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

  // ── Billing extension removed (Track E4) ─────────────────────────────────
  // checkout.session.completed used to realign a subscription's next charge
  // to match day (the 5th) whenever Stripe's natural signup anchor didn't
  // land there. That block was deleted once Track E2 made it moot — every
  // subscription now pauses right after each successful payment (including
  // this first one), so it never bills on its own natural Stripe schedule
  // again. Regression guard: checkout.session.completed should never call
  // subscriptions.update at all any more, regardless of the natural anchor.

  it.each([
    ["Nov 1 (would have been Case A)", "2026-11-01T10:00:00Z"],
    ["Nov 6 (would have been Case B)", "2026-11-06T10:00:00Z"],
    ["Aug 5 (already aligned)", "2026-08-05T14:32:00Z"],
  ])(
    "checkout.session.completed never extends billing any more (%s)",
    async (_label, currentPeriodEndISO) => {
      const member = await seedMember({ status: "pending" });
      memberId = member.id;
      makeCheckoutEvent(memberId, member.email, "commitment_3mo", currentPeriodEndISO);

      const res = await POST(makeRequest("{}"));
      expect(res.status).toBe(200);
      expect(mockUpdate).not.toHaveBeenCalled();
    }
  );

  // ── Gift card routing test ───────────────────────────────────────────────

  it("does not invoke gift card logic for a regular subscription checkout", async () => {
    const member = await seedMember({ status: "pending" });
    memberId = member.id;

    mockRetrieve.mockResolvedValue({
      items: {
        data: [
          {
            price: { id: "price_test_monthly", lookup_key: "standard_monthly" },
            current_period_end: Math.floor(new Date("2026-09-05T00:00:00Z").getTime() / 1000),
          },
        ],
      },
      metadata: {},
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
      items: {
        data: [
          {
            price: { id: "price_test_3mo", lookup_key: "commitment_3mo" },
            current_period_end: Math.floor(new Date("2026-09-05T00:00:00Z").getTime() / 1000),
          },
        ],
      },
      metadata: {},
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

  // ── invoice.payment_succeeded — Track B3: refill ──────────────────────
  //
  // Ledger write + counter bump only. Deliberately does NOT pause the
  // Stripe subscription here (see the handler's own comment) — that's E2,
  // once a renew-check job exists that could actually resume it.
  describe("invoice.payment_succeeded", () => {
    async function seedMemberWithSubscription(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      overrides: { lookupKey?: string; intervalCount?: number; discounts?: any[] } = {}
    ) {
      const member = await seedMember({ matches_remaining: 0 });
      const supabase = createTestSupabase();
      const stripeSubId = `sub_test_${member.id.slice(0, 8)}`;
      await supabase.from("subscriptions").insert({
        member_id: member.id,
        stripe_subscription_id: stripeSubId,
        stripe_price_id: "price_test",
        status: "active",
      });
      mockRetrieve.mockResolvedValue({
        items: {
          data: [
            {
              price: {
                lookup_key: overrides.lookupKey ?? "standard_monthly",
                recurring: { interval_count: overrides.intervalCount ?? 1 },
              },
            },
          ],
        },
        discounts: overrides.discounts,
      });
      return { member, stripeSubId };
    }

    // A discount object shaped like Stripe's real "discounts.source.coupon"
    // expansion (Track C4) — coupon may arrive already expanded, or as a
    // bare string id (exercising the coupons.retrieve() fallback).
    function giftDiscount(coupon: unknown = { metadata: { product: "gift_card" } }) {
      return { source: { type: "coupon", coupon } };
    }

    function nonGiftDiscount() {
      return { source: { type: "coupon", coupon: { metadata: {} } } };
    }

    function makeInvoiceEvent(
      invoiceId: string,
      subscriptionId: string,
      extra: Record<string, unknown> = {}
    ) {
      mockConstructEvent.mockReturnValue({
        type: "invoice.payment_succeeded",
        data: {
          object: {
            id: invoiceId,
            parent: { subscription_details: { subscription: subscriptionId } },
            ...extra,
          },
        },
      });
    }

    it("grants matchesPerTerm to the member's counter", async () => {
      const { member, stripeSubId } = await seedMemberWithSubscription({ intervalCount: 3 });
      memberId = member.id;
      makeInvoiceEvent(`in_test_${member.id.slice(0, 8)}`, stripeSubId);

      const res = await POST(makeRequest("{}"));
      expect(res.status).toBe(200);

      const supabase = createTestSupabase();
      const { data: updated } = await supabase
        .from("members")
        .select("matches_remaining")
        .eq("id", member.id)
        .single();
      expect(updated?.matches_remaining).toBe(3);

      const { data: rows } = await supabase
        .from("match_entitlements")
        .select("event, delta, stripe_invoice_id")
        .eq("member_id", member.id);
      expect(rows).toHaveLength(1);
      expect(rows![0].event).toBe("term_payment");
      expect(rows![0].delta).toBe(3);
    });

    // ── Track E2: pause right after a fresh grant ──────────────────────────

    it("pauses the subscription immediately after a fresh grant", async () => {
      const { member, stripeSubId } = await seedMemberWithSubscription({ intervalCount: 1 });
      memberId = member.id;
      makeInvoiceEvent(`in_test_pause_${member.id.slice(0, 8)}`, stripeSubId);

      const res = await POST(makeRequest("{}"));
      expect(res.status).toBe(200);

      expect(mockUpdate).toHaveBeenCalledWith(stripeSubId, {
        pause_collection: { behavior: "void" },
      });
    });

    it("does not double-count a replayed invoice, and does not re-issue the pause call", async () => {
      const { member, stripeSubId } = await seedMemberWithSubscription({ intervalCount: 1 });
      memberId = member.id;
      const invoiceId = `in_test_replay_${member.id.slice(0, 8)}`;
      makeInvoiceEvent(invoiceId, stripeSubId);

      await POST(makeRequest("{}"));
      mockUpdate.mockClear();
      const res = await POST(makeRequest("{}")); // same invoice id, replayed
      expect(res.status).toBe(200);

      const supabase = createTestSupabase();
      const { data: updated } = await supabase
        .from("members")
        .select("matches_remaining")
        .eq("id", member.id)
        .single();
      expect(updated?.matches_remaining).toBe(1); // not 2

      const { data: rows } = await supabase
        .from("match_entitlements")
        .select("id")
        .eq("member_id", member.id);
      expect(rows).toHaveLength(1);

      // A replay is a no-op grant (applied === false) — no reason to
      // re-issue the pause_collection call.
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("still refills on a €0 invoice", async () => {
      const { member, stripeSubId } = await seedMemberWithSubscription({ intervalCount: 1 });
      memberId = member.id;
      makeInvoiceEvent(`in_test_zero_${member.id.slice(0, 8)}`, stripeSubId, { amount_paid: 0 });

      const res = await POST(makeRequest("{}"));
      expect(res.status).toBe(200);

      const supabase = createTestSupabase();
      const { data: updated } = await supabase
        .from("members")
        .select("matches_remaining")
        .eq("id", member.id)
        .single();
      expect(updated?.matches_remaining).toBe(1);
    });

    it("grants nothing on invoice.created", async () => {
      const { member, stripeSubId } = await seedMemberWithSubscription();
      memberId = member.id;
      mockConstructEvent.mockReturnValue({
        type: "invoice.created",
        data: {
          object: {
            id: `in_test_created_${member.id.slice(0, 8)}`,
            parent: { subscription_details: { subscription: stripeSubId } },
          },
        },
      });

      const res = await POST(makeRequest("{}"));
      expect(res.status).toBe(200);

      const supabase = createTestSupabase();
      const { data: updated } = await supabase
        .from("members")
        .select("matches_remaining")
        .eq("id", member.id)
        .single();
      expect(updated?.matches_remaining).toBe(0);
    });

    it("excludes FYP's own products from the counter", async () => {
      const { member, stripeSubId } = await seedMemberWithSubscription({ lookupKey: "fyp_monthly_single" });
      memberId = member.id;
      makeInvoiceEvent(`in_test_fyp_${member.id.slice(0, 8)}`, stripeSubId);

      const res = await POST(makeRequest("{}"));
      expect(res.status).toBe(200);

      const supabase = createTestSupabase();
      const { data: updated } = await supabase
        .from("members")
        .select("matches_remaining")
        .eq("id", member.id)
        .single();
      expect(updated?.matches_remaining).toBe(0);

      const { data: rows } = await supabase
        .from("match_entitlements")
        .select("id")
        .eq("member_id", member.id);
      expect(rows).toHaveLength(0);
    });

    it("no-ops when there's no local subscription for the Stripe subscription id", async () => {
      mockConstructEvent.mockReturnValue({
        type: "invoice.payment_succeeded",
        data: {
          object: {
            id: "in_test_orphan",
            parent: { subscription_details: { subscription: "sub_does_not_exist_locally" } },
          },
        },
      });

      const res = await POST(makeRequest("{}"));
      expect(res.status).toBe(200); // non-fatal — logged, not thrown
    });

    // ── Track C4: tagging gift-covered term_payment rows ──────────────────

    it("tags the entitlement with note: gift when a gift coupon is active", async () => {
      const { member, stripeSubId } = await seedMemberWithSubscription({
        intervalCount: 3,
        discounts: [giftDiscount()],
      });
      memberId = member.id;
      makeInvoiceEvent(`in_test_gift_${member.id.slice(0, 8)}`, stripeSubId);

      const res = await POST(makeRequest("{}"));
      expect(res.status).toBe(200);

      const supabase = createTestSupabase();
      const { data: rows } = await supabase
        .from("match_entitlements")
        .select("note")
        .eq("member_id", member.id);
      expect(rows).toHaveLength(1);
      expect(rows![0].note).toBe("gift");
      expect(mockRetrieveCoupon).not.toHaveBeenCalled(); // already expanded — no fallback needed
    });

    it("falls back to coupons.retrieve when the coupon wasn't expanded", async () => {
      mockRetrieveCoupon.mockResolvedValue({ metadata: { product: "gift_card" } });
      const { member, stripeSubId } = await seedMemberWithSubscription({
        intervalCount: 3,
        discounts: [giftDiscount("coupon_unexpanded")],
      });
      memberId = member.id;
      makeInvoiceEvent(`in_test_gift_fallback_${member.id.slice(0, 8)}`, stripeSubId);

      const res = await POST(makeRequest("{}"));
      expect(res.status).toBe(200);

      expect(mockRetrieveCoupon).toHaveBeenCalledWith("coupon_unexpanded");
      const supabase = createTestSupabase();
      const { data: rows } = await supabase
        .from("match_entitlements")
        .select("note")
        .eq("member_id", member.id);
      expect(rows![0].note).toBe("gift");
    });

    it("does not tag a non-gift discount as a gift", async () => {
      const { member, stripeSubId } = await seedMemberWithSubscription({
        intervalCount: 1,
        discounts: [nonGiftDiscount()],
      });
      memberId = member.id;
      makeInvoiceEvent(`in_test_nongift_${member.id.slice(0, 8)}`, stripeSubId);

      const res = await POST(makeRequest("{}"));
      expect(res.status).toBe(200);

      const supabase = createTestSupabase();
      const { data: rows } = await supabase
        .from("match_entitlements")
        .select("note")
        .eq("member_id", member.id);
      expect(rows![0].note).toBeNull();
    });

    it("leaves note null when there's no discount at all", async () => {
      const { member, stripeSubId } = await seedMemberWithSubscription({ intervalCount: 1 });
      memberId = member.id;
      makeInvoiceEvent(`in_test_nodiscount_${member.id.slice(0, 8)}`, stripeSubId);

      const res = await POST(makeRequest("{}"));
      expect(res.status).toBe(200);

      const supabase = createTestSupabase();
      const { data: rows } = await supabase
        .from("match_entitlements")
        .select("note")
        .eq("member_id", member.id);
      expect(rows![0].note).toBeNull();
    });
  });
});
