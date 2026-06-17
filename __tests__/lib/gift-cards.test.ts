import { describe, it, expect, vi, beforeEach } from "vitest";
import Stripe from "stripe";

// --- Mocks ---

const { mockCreateCoupon, mockCreatePromotionCode, mockInsert, mockRetrievePrice } = vi.hoisted(() => ({
  mockCreateCoupon: vi.fn().mockResolvedValue({ id: "coupon_test" }),
  mockCreatePromotionCode: vi.fn().mockResolvedValue({ id: "promo_test" }),
  mockInsert: vi.fn().mockResolvedValue({ error: null }),
  mockRetrievePrice: vi.fn().mockResolvedValue({ product: "prod_test" }),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    coupons: { create: mockCreateCoupon },
    promotionCodes: { create: mockCreatePromotionCode },
    prices: { retrieve: mockRetrievePrice },
  }),
}));

vi.mock("@/lib/supabase", () => ({
  createAdminClient: () => ({
    from: () => ({ insert: mockInsert }),
  }),
}));

vi.mock("@/lib/emails", () => ({
  sendGiftCardEmail: vi.fn().mockResolvedValue(undefined),
}));

import { createGiftCard } from "@/lib/gift-cards";
import { sendGiftCardEmail } from "@/lib/emails";

function makeSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    metadata: { product: "gift_card", gift_months: "1" },
    customer_details: { email: "buyer@example.com" },
    custom_fields: [],
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

describe("createGiftCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCoupon.mockResolvedValue({ id: "coupon_test" });
    mockCreatePromotionCode.mockResolvedValue({ id: "promo_test" });
    mockInsert.mockResolvedValue({ error: null });
    mockRetrievePrice.mockResolvedValue({ product: "prod_test" });
  });

  it("creates a 100%-off repeating coupon restricted to the correct product", async () => {
    await createGiftCard(makeSession({ metadata: { product: "gift_card", gift_months: "1" } }));

    expect(mockCreateCoupon).toHaveBeenCalledWith({
      percent_off: 100,
      duration: "repeating",
      duration_in_months: 1,
      applies_to: { products: ["prod_test"] },
      metadata: { product: "gift_card" },
    });
  });

  it("creates a promotion code with max_redemptions=1 linked to the coupon", async () => {
    await createGiftCard(makeSession({ metadata: { product: "gift_card", gift_months: "1" } }));

    expect(mockCreatePromotionCode).toHaveBeenCalledWith(
      expect.objectContaining({
        promotion: { type: "coupon", coupon: "coupon_test" },
        max_redemptions: 1,
      })
    );
  });

  it("inserts a gift_cards row with the correct data", async () => {
    await createGiftCard(makeSession({
      metadata: { product: "gift_card", gift_months: "3" },
      customer_details: { email: "buyer@example.com" },
    }));

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        buyer_email: "buyer@example.com",
        gift_months: 3,
        stripe_coupon_id: "coupon_test",
        stripe_promotion_code_id: "promo_test",
      })
    );
  });

  it("sends the gift card email to the buyer when no recipient_email is provided", async () => {
    await createGiftCard(makeSession({
      customer_details: { email: "buyer@example.com" },
      custom_fields: [],
    }));

    expect(sendGiftCardEmail).toHaveBeenCalledWith("buyer@example.com", expect.any(String), 1);
  });

  it("sends the gift card email to the recipient when recipient_email is provided", async () => {
    await createGiftCard(makeSession({
      customer_details: { email: "buyer@example.com" },
      custom_fields: [{ key: "recipientsemail", text: { value: "recipient@example.com" } }],
    }));

    expect(sendGiftCardEmail).toHaveBeenCalledWith("recipient@example.com", expect.any(String), 1);
  });

  it("stores buyer_email and recipient_email separately in the DB row", async () => {
    await createGiftCard(makeSession({
      customer_details: { email: "buyer@example.com" },
      custom_fields: [{ key: "recipientsemail", text: { value: "recipient@example.com" } }],
    }));

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        buyer_email: "buyer@example.com",
        recipient_email: "recipient@example.com",
      })
    );
  });

  it("throws when gift_months is missing from metadata", async () => {
    await expect(
      createGiftCard(makeSession({ metadata: { product: "gift_card" } }))
    ).rejects.toThrow("invalid gift_months");
  });

  it("throws when the Supabase insert fails", async () => {
    mockInsert.mockResolvedValueOnce({ error: { message: "relation does not exist" } });

    await expect(createGiftCard(makeSession())).rejects.toThrow("supabase insert failed");
  });
});
