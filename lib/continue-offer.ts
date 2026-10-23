import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase";
import { isComped } from "@/lib/billing-mode";
import { loadContinueOffer, loadRegularContinuePlans, type ContinuePlan } from "@/lib/continue-offer-pricing";

type AdminClient = ReturnType<typeof createAdminClient>;

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://postpartumpost.com";

export { isContinuePlan, type ContinuePlan } from "@/lib/continue-offer-pricing";

export type ContinueCheckoutResult = { url: string } | { error: string };

/**
 * Starts a Stripe Checkout for a comped member who wants to keep going.
 *
 * Any active comped member can use it:
 *  - a cohort member whose cohort has a continue promotion code gets that
 *    discount. The code is applied up front (the discount is whatever the
 *    Stripe coupon says), so the member never types a code.
 *  - everyone else (no cohort, e.g. a gifted membership, or a cohort with no
 *    code set) pays the regular price. Special offers go through cohorts.
 * A cohort whose code is set but unusable is "offer_misconfigured", not a
 * silent fallback to full price. On completion the Stripe webhook switches
 * the member to billing_mode "subscription", and the usual term-payment
 * handling grants the matches.
 */
export async function createContinueCheckoutUrl(
  supabase: AdminClient,
  memberId: string,
  plan: ContinuePlan
): Promise<ContinueCheckoutResult> {
  const { data: member } = await supabase
    .from("members")
    .select("id, email, first_name, last_name, status, billing_mode, cohort, stripe_customer_id")
    .eq("id", memberId)
    .maybeSingle();

  if (!member || member.status !== "active" || !isComped(member.billing_mode)) {
    return { error: "not_eligible" };
  }

  const stripe = getStripe();

  // A cohort with a continue code gets its discount; no cohort, or a cohort with
  // no code, pays the regular price.
  let promotionCodeId: string | null = null;
  if (member.cohort) {
    const { data: cohort } = await supabase
      .from("cohorts")
      .select("continue_promo_code_id")
      .eq("slug", member.cohort)
      .maybeSingle();
    promotionCodeId = cohort?.continue_promo_code_id ?? null;
  }
  if (promotionCodeId) {
    // Active promotion code with a coupon that applies to both plans.
    const offer = await loadContinueOffer(stripe, promotionCodeId);
    if (!offer) {
      console.error("[continue-offer] promotion code unusable (inactive, no coupon, or a plan price missing):", promotionCodeId);
      return { error: "offer_misconfigured" };
    }
  }

  const prices = await stripe.prices.list({ lookup_keys: [plan], active: true, limit: 1 });
  const price = prices.data[0];
  if (!price) {
    console.error("[continue-offer] price not found for lookup key:", plan);
    return { error: "price_not_found" };
  }

  let customerId = member.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: member.email,
      name: [member.first_name, member.last_name].filter(Boolean).join(" ") || undefined,
      metadata: { member_id: member.id },
    });
    customerId = customer.id;
    await supabase.from("members").update({ stripe_customer_id: customerId }).eq("id", member.id);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: price.id, quantity: 1 }],
    ...(promotionCodeId ? { discounts: [{ promotion_code: promotionCodeId }] } : {}),
    automatic_tax: { enabled: false },
    metadata: { member_id: member.id, continue_offer: "1" },
    success_url: `${SITE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
    // Not /canceled: that route marks the member "abandoned", which is only
    // right for a signup that never finished. This member is already active.
    cancel_url: `${SITE_URL}/billing`,
  });

  if (!session.url) return { error: "no_session_url" };
  return { url: session.url };
}

/**
 * The offer as the billing page shows it: a comped cohort member's discounted
 * prices (when the cohort has a continue promotion code), or the regular prices
 * for any other comped member (no cohort, or a cohort with no code). Null when
 * there's nothing to show.
 */
export async function getContinueOfferForMember(
  supabase: AdminClient,
  memberId: string
): Promise<import("@/lib/continue-offer-pricing").ContinueOfferDetails | null> {
  const { data: member } = await supabase
    .from("members")
    .select("status, billing_mode, cohort")
    .eq("id", memberId)
    .maybeSingle();
  if (!member || member.status !== "active" || !isComped(member.billing_mode)) return null;

  let promotionCodeId: string | null = null;
  if (member.cohort) {
    const { data: cohort } = await supabase
      .from("cohorts")
      .select("continue_promo_code_id")
      .eq("slug", member.cohort)
      .maybeSingle();
    promotionCodeId = cohort?.continue_promo_code_id ?? null;
  }

  try {
    return promotionCodeId
      ? await loadContinueOffer(getStripe(), promotionCodeId)
      : await loadRegularContinuePlans(getStripe());
  } catch (e) {
    console.error("[continue-offer] loading the offer failed:", e);
    return null;
  }
}
