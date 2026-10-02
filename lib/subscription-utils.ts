import { getStripe } from "@/lib/stripe";

/**
 * Pauses collection on a subscription (pause_collection: void), the same
 * resting state the invoice.payment_succeeded webhook puts every subscription
 * in after a grant (billing-simplification-plan.md, Track E2).
 *
 * Used when a member cancels (app/actions/unsubscribe.ts): it guarantees
 * Stripe can never bill them again, WITHOUT scheduling a Stripe-side
 * cancellation. Stripe only collects money; the DB counter alone decides
 * when access ends, and renew-check finalizes the cancellation at zero.
 * Idempotent.
 */
export async function pauseSubscriptionCollection(subscriptionId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.subscriptions.update(subscriptionId, {
    pause_collection: { behavior: "void" },
  });
}
