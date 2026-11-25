import { describe, it, expect, vi, beforeEach } from "vitest";

// createContinueCheckoutUrl: a cohort member gets their cohort's discount; a
// comped member with no cohort (a gifted membership) checks out at the regular price.
const { sessionsCreate, pricesList, mockLoadOffer } = vi.hoisted(() => ({
  sessionsCreate: vi.fn(),
  pricesList: vi.fn(),
  mockLoadOffer: vi.fn(),
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    prices: { list: pricesList },
    checkout: { sessions: { create: sessionsCreate } },
    customers: { create: vi.fn(async () => ({ id: "cus_new" })) },
  }),
}));
vi.mock("@/lib/continue-offer-pricing", async (orig) => ({ ...(await orig<object>()), loadContinueOffer: mockLoadOffer }));

import { createContinueCheckoutUrl } from "@/lib/continue-offer";

type MemberRow = { id: string; email: string; first_name: string; last_name: string; status: string; billing_mode: string; cohort: string | null; stripe_customer_id: string | null; matches_remaining: number };

function db(member: MemberRow | null, cohortPromo: string | null = null, liveSubs: unknown[] = []) {
  return {
    from(table: string) {
      const b: Record<string, unknown> = {
        select: () => b,
        update: () => b,
        eq: () => b,
        neq: () => b,
        limit: () => b,
        maybeSingle: async () => ({ data: table === "members" ? member : { continue_promo_code_id: cohortPromo } }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: table === "subscriptions" ? liveSubs : null, error: null }).then(resolve),
      };
      return b;
    },
  } as never;
}

const GIFTED: MemberRow = { id: "m1", email: "a@x.test", first_name: "A", last_name: "B", status: "active", billing_mode: "comped_with_perks", cohort: null, stripe_customer_id: "cus_1", matches_remaining: 0 };

describe("createContinueCheckoutUrl", () => {
  beforeEach(() => {
    sessionsCreate.mockReset().mockResolvedValue({ url: "https://checkout.test/s" });
    pricesList.mockReset().mockResolvedValue({ data: [{ id: "price_1" }] });
    mockLoadOffer.mockReset().mockResolvedValue({ discountText: "€4 off", durationNote: "", plans: [] });
  });

  it("charges the regular price (no discount) for a comped member with no cohort", async () => {
    const result = await createContinueCheckoutUrl(db(GIFTED), "m1", "standard_monthly");
    expect(result).toEqual({ url: "https://checkout.test/s" });
    const args = sessionsCreate.mock.calls[0][0];
    expect(args.discounts).toBeUndefined();
    expect(args.line_items).toEqual([{ price: "price_1", quantity: 1 }]);
    expect(args.metadata).toMatchObject({ member_id: "m1", continue_offer: "1" });
    expect(mockLoadOffer).not.toHaveBeenCalled();
  });

  it("applies the cohort's promotion code for a cohort member", async () => {
    await createContinueCheckoutUrl(db({ ...GIFTED, cohort: "dsa" }, "promo_1"), "m1", "commitment_3mo");
    expect(sessionsCreate.mock.calls[0][0].discounts).toEqual([{ promotion_code: "promo_1" }]);
  });

  it("falls back to the regular price for a cohort member whose cohort has no code", async () => {
    const result = await createContinueCheckoutUrl(db({ ...GIFTED, cohort: "aic" }, null), "m1", "standard_monthly");
    expect(result).toEqual({ url: "https://checkout.test/s" });
    expect(sessionsCreate.mock.calls[0][0].discounts).toBeUndefined();
  });

  it("does not silently charge full price when the cohort's code is set but unusable", async () => {
    mockLoadOffer.mockResolvedValue(null);
    expect(await createContinueCheckoutUrl(db({ ...GIFTED, cohort: "dsa" }, "promo_dead"), "m1", "standard_monthly")).toEqual({ error: "offer_misconfigured" });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("refuses members who can't continue", async () => {
    // Active but already paying, no such member, or a member who hasn't ended (pending).
    for (const m of [{ ...GIFTED, billing_mode: "subscription" }, { ...GIFTED, status: "pending" }, null]) {
      expect(await createContinueCheckoutUrl(db(m as MemberRow | null), "m1", "standard_monthly")).toEqual({ error: "not_eligible" });
    }
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  describe("rejoin (ended members)", () => {
    const ENDED: MemberRow = { ...GIFTED, status: "inactive", billing_mode: "subscription", cohort: "dsa" };

    it("charges the regular price, ignoring any cohort discount, for an inactive member", async () => {
      const result = await createContinueCheckoutUrl(db(ENDED, "promo_1"), "m1", "commitment_3mo");
      expect(result).toEqual({ url: "https://checkout.test/s" });
      const args = sessionsCreate.mock.calls[0][0];
      expect(args.discounts).toBeUndefined();
      expect(args.metadata).toMatchObject({ member_id: "m1", continue_offer: "1", rejoin: "1" });
      expect(mockLoadOffer).not.toHaveBeenCalled();
    });

    it("allows a canceled member with no rounds and no live subscription", async () => {
      const result = await createContinueCheckoutUrl(db({ ...ENDED, status: "canceling" }), "m1", "standard_monthly");
      expect(result).toEqual({ url: "https://checkout.test/s" });
    });

    it("refuses a canceled member who still has rounds left", async () => {
      expect(await createContinueCheckoutUrl(db({ ...ENDED, status: "canceling", matches_remaining: 2 }), "m1", "standard_monthly")).toEqual({ error: "not_eligible" });
      expect(sessionsCreate).not.toHaveBeenCalled();
    });

    it("refuses when a live subscription exists (they should resume instead of paying twice)", async () => {
      const live = [{ stripe_subscription_id: "sub_1" }];
      for (const status of ["inactive", "canceling"]) {
        expect(await createContinueCheckoutUrl(db({ ...ENDED, status }, null, live), "m1", "standard_monthly")).toEqual({ error: "not_eligible" });
      }
      expect(sessionsCreate).not.toHaveBeenCalled();
    });
  });
});
