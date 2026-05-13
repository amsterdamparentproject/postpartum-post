import { getStripe } from "@/lib/stripe";

export async function extendSubscriptionByOneMonth(subscriptionId: string): Promise<void> {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  const newPeriodEnd = new Date(subscription.current_period_end * 1000);
  newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

  await stripe.subscriptions.update(subscriptionId, {
    trial_end: Math.floor(newPeriodEnd.getTime() / 1000),
    proration_behavior: "none",
  });
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.subscriptions.cancel(subscriptionId);
}
