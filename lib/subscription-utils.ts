import { getStripe } from "@/lib/stripe";

/**
 * Cancels at period end and returns the date access actually ends, so
 * callers can tell the member exactly when that is (immediate cancellation
 * confirmation email — see app/actions/unsubscribe.ts).
 */
export async function cancelSubscription(
  subscriptionId: string
): Promise<{ periodEnd: Date }> {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
    expand: ["items"],
  });
  return { periodEnd: new Date(subscription.items.data[0].current_period_end * 1000) };
}
