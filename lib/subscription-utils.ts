import { getStripe } from "@/lib/stripe";
import { extendToNext5thOfMonth } from "@/lib/billing";

export type ExtensionResult = { previousDate: Date; newDate: Date };

/**
 * Extends a subscription's billing so its next charge lands on the next
 * 5th-of-month at or after its current period end, instead of a flat
 * "+1 month" bump. For a subscription already anchored to the 5th (the
 * normal case for anything that's gone through the signup-time correction
 * in app/api/webhooks/stripe/route.ts), this produces the same date as
 * +1 month would. For a subscription whose period end has drifted off the
 * 5th for any reason, it self-corrects back to match day instead of
 * perpetuating the drift.
 *
 * Safe to call post-checkout: it only ever pushes the period end later than
 * its current value, never earlier, so it can't trigger the credit/
 * re-invoice behavior that caused the July 2026 billing bug (see
 * __claude__/billing-extension-bugfix-plan.md).
 *
 * `metadata`, if given, is merged into the subscription's existing metadata
 * (not replaced).
 *
 * Shared by every place that needs to push a subscription's next charge out
 * by one cycle: member-initiated skips (app/actions/skip.ts and the
 * match-response flows in app/api/optin/route.ts,
 * app/(account)/matches/actions.ts, app/api/monthly-response/route.ts),
 * free-month grants (lib/free-month-grants.ts), and the signup-time
 * billing-anchor correction (app/api/webhooks/stripe/route.ts).
 */
export async function extendSubscriptionToNext5th(
  subscriptionId: string,
  metadata?: Record<string, string>
): Promise<ExtensionResult> {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items"],
  });

  const previousDate = new Date(subscription.items.data[0].current_period_end * 1000);
  const newDate = extendToNext5thOfMonth(previousDate);

  await stripe.subscriptions.update(subscriptionId, {
    trial_end: Math.floor(newDate.getTime() / 1000),
    proration_behavior: "none",
    ...(metadata ? { metadata: { ...subscription.metadata, ...metadata } } : {}),
  });

  return { previousDate, newDate };
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}
