import { getStripe } from "@/lib/stripe";

export async function extendSubscriptionByOneMonth(subscriptionId: string): Promise<void> {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items"],
  });

  const newPeriodEnd = new Date(subscription.items.data[0].current_period_end * 1000);
  newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

  await stripe.subscriptions.update(subscriptionId, {
    trial_end: Math.floor(newPeriodEnd.getTime() / 1000),
    proration_behavior: "none",
  });
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}
