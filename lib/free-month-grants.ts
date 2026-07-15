import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase";
import { extendSubscriptionToNext5th } from "@/lib/subscription-utils";

export type GrantResult = {
  memberEmail: string;
  plan: "standard_monthly" | "prepaid_3mo";
  previousNextChargeDate: Date;
  newNextChargeDate: Date;
};

/**
 * Grants an existing, active member one free month by extending their
 * subscription timeline directly — no coupon, no checkout session, no
 * charge. For new (not-yet-subscribed) recipients, use the gift card flow
 * (lib/gift-cards.ts) instead — this function is specifically for members
 * who already have an active subscription.
 *
 * - Monthly plans (`standard_monthly`): pauses collection through the end
 *   of the current calendar month, so the invoice that would otherwise fire
 *   this month is skipped; collection resumes automatically at the start of
 *   next month. Mirrors the exact mechanism `app/actions/skip.ts` already
 *   uses for member-initiated month skips.
 * - 3-month plans (`founding_member`, `commitment_3mo`): pushes `trial_end`
 *   forward to the next 5th-of-month via the shared
 *   `extendSubscriptionToNext5th` helper (lib/subscription-utils.ts), with
 *   `proration_behavior: "none"`. This is safe specifically because it
 *   *extends* the period forward rather than shortening it — shortening an
 *   already-invoiced period is what caused the July 2026 billing-extension
 *   bug (see __claude__/billing-extension-bugfix-plan.md). Extending
 *   forward adds free time on top of an already-paid-for period instead of
 *   clawing back paid-for time, so it doesn't trigger the same stub
 *   credit/re-invoice behavior.
 *
 * Tags the Stripe subscription with metadata so the grant is visible
 * directly on the subscription in the Stripe Dashboard, independent of any
 * app-side record — following the same `metadata.<key>` convention already
 * used for gift cards (`metadata.product = "gift_card"` on the coupon):
 *   { grant_type: "free_month", grant_reason: <string>, granted_at: <ISO> }
 *
 * `grantReason` is a free-text string (e.g. "customer_service", "art_comp")
 * — not validated against a fixed list, so new reasons can be used without
 * a code change.
 *
 * Does not send any customer-facing email yet — that's a follow-up TODO.
 */
export async function grantFreeMonth(
  memberEmail: string,
  grantReason: string
): Promise<GrantResult> {
  const supabase = createAdminClient();
  const stripe = getStripe();

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id, email")
    .eq("email", memberEmail.toLowerCase())
    .single();

  if (memberError || !member) {
    throw new Error(`No member found with email ${memberEmail}`);
  }

  const { data: sub, error: subError } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("member_id", member.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subError || !sub?.stripe_subscription_id) {
    throw new Error(`No active subscription found for ${memberEmail}`);
  }

  const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id, {
    expand: ["items.data.price"],
  });

  const priceKey = stripeSub.items.data[0]?.price?.lookup_key ?? "";
  const isMonthly = priceKey === "standard_monthly";
  const currentPeriodEnd = stripeSub.items.data[0].current_period_end;

  console.log(
    `[grant-free-month] Member subscription found: ${memberEmail}, current end date: ${new Date(currentPeriodEnd * 1000).toISOString()}`
  );

  const grantMetadata = {
    ...stripeSub.metadata,
    grant_type: "free_month",
    grant_reason: grantReason,
    granted_at: new Date().toISOString(),
  };

  if (isMonthly) {
    // Pause through the end of the current calendar month — same shape as
    // the monthly branch of app/actions/skip.ts's adjustStripeBilling, just
    // anchored to "now" instead of a specific opted-out month.
    const now = new Date();
    const nextMonth =
      now.getUTCMonth() === 11
        ? new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1))
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const resumesAt = Math.floor(nextMonth.getTime() / 1000);

    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      pause_collection: { behavior: "void", resumes_at: resumesAt },
      metadata: grantMetadata,
    });

    console.log(
      `[grant-free-month] Member subscription successfully updated: ${memberEmail}, new end date: ${nextMonth.toISOString()}`
    );

    return {
      memberEmail,
      plan: "standard_monthly",
      previousNextChargeDate: new Date(currentPeriodEnd * 1000),
      newNextChargeDate: nextMonth,
    };
  }

  const { newDate } = await extendSubscriptionToNext5th(sub.stripe_subscription_id, grantMetadata);

  console.log(
    `[grant-free-month] Member subscription successfully updated: ${memberEmail}, new end date: ${newDate.toISOString()}`
  );

  return {
    memberEmail,
    plan: "prepaid_3mo",
    previousNextChargeDate: new Date(currentPeriodEnd * 1000),
    newNextChargeDate: newDate,
  };
}
