import type Stripe from "stripe";

/**
 * What the continue offer looks like to the member: read from Stripe (the
 * cohort's promotion code and the two plan prices), never hard-coded, so the
 * numbers shown are the numbers charged. Only `import type` from stripe, so the
 * send script and the email can load this file directly.
 */

/** The two plans a comped cohort member can continue on (Stripe price lookup keys). */
export type ContinuePlan = "standard_monthly" | "commitment_3mo";

export const CONTINUE_PLAN_ORDER: ContinuePlan[] = ["standard_monthly", "commitment_3mo"];

export const CONTINUE_PLAN_LABELS: Record<ContinuePlan, string> = {
  standard_monthly: "1 round",
  commitment_3mo: "3 rounds",
};

export function isContinuePlan(value: unknown): value is ContinuePlan {
  return value === "standard_monthly" || value === "commitment_3mo";
}

export type ContinueOfferDetails = {
  /** "€4 off" or "50% off". */
  discountText: string;
  /** One sentence on how long the discount lasts and what happens after. */
  durationNote: string;
  plans: { plan: ContinuePlan; label: string; regularCents: number; offerCents: number }[];
};

type CouponTerms = Pick<Stripe.Coupon, "amount_off" | "percent_off" | "currency" | "duration" | "duration_in_months">;

/**
 * Money units in this repo: Stripe amounts (price.unit_amount, coupon.amount_off,
 * invoice totals) are integer CENTS and stay that way inside the code, so there
 * is never a float to round before a Stripe call. Anything a person types or
 * reads in the database (perks.estimated_savings, cohorts.partner_rate_eur) is
 * EUROS. The name says which: formatCents takes cents, formatEuros takes euros.
 */

/** Euros to text: 6 -> "€6", 6.5 -> "€6.50", 108 -> "€108". */
export function formatEuros(euros: number): string {
  return `€${Number.isInteger(euros) ? euros : euros.toFixed(2)}`;
}

/** Stripe cents to text: 800 -> "€8", 850 -> "€8.50". */
export function formatCents(cents: number): string {
  return formatEuros(cents / 100);
}

/** Price after the coupon, or null when the coupon can't be applied (wrong currency). */
export function applyCoupon(unitCents: number, currency: string, coupon: CouponTerms): number | null {
  if (coupon.amount_off != null) {
    if (coupon.currency !== currency) return null;
    return Math.max(0, unitCents - coupon.amount_off);
  }
  if (coupon.percent_off != null) {
    return Math.max(0, Math.round(unitCents * (1 - coupon.percent_off / 100)));
  }
  return null;
}

export function describeDiscount(coupon: CouponTerms): string {
  if (coupon.amount_off != null) return `${formatCents(coupon.amount_off)} off`;
  return `${coupon.percent_off}% off`;
}

export function describeDuration(coupon: CouponTerms): string {
  if (coupon.duration === "once") {
    return "The membership discount applies to your first payment only. After that your plan renews at the regular price, and you can cancel anytime.";
  }
  if (coupon.duration === "repeating") {
    const n = coupon.duration_in_months ?? 1;
    return `The membership discount applies for your first ${n === 1 ? "month" : `${n} months`}. After that your plan renews at the regular price, and you can cancel anytime.`;
  }
  return "The membership discount stays on your plan for as long as you're a member, and you can cancel anytime.";
}

/**
 * Loads the offer for a cohort's promotion code. Null when the code is inactive,
 * has no coupon, or a plan price can't be found or discounted.
 */
export async function loadContinueOffer(
  stripe: Stripe,
  promotionCodeId: string
): Promise<ContinueOfferDetails | null> {
  const promo = await stripe.promotionCodes.retrieve(promotionCodeId, { expand: ["promotion.coupon"] });
  const coupon = promo.promotion?.coupon;
  if (!promo.active || !coupon || typeof coupon === "string") return null;

  const plans: ContinueOfferDetails["plans"] = [];
  for (const plan of CONTINUE_PLAN_ORDER) {
    const prices = await stripe.prices.list({ lookup_keys: [plan], active: true, limit: 1 });
    const price = prices.data[0];
    if (!price || price.unit_amount == null) return null;
    const offerCents = applyCoupon(price.unit_amount, price.currency, coupon);
    if (offerCents == null) return null;
    plans.push({ plan, label: CONTINUE_PLAN_LABELS[plan], regularCents: price.unit_amount, offerCents });
  }
  return { discountText: describeDiscount(coupon), durationNote: describeDuration(coupon), plans };
}
