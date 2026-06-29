"use server";

import { redirect } from "next/navigation";
import { getStripe } from "@/lib/stripe";
import { cancelSubscription } from "@/lib/subscription-utils";
import { createAdminClient } from "@/lib/supabase";

export async function unsubscribe(memberId: string) {
  const supabase = createAdminClient();

  const { data: subscription, error } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("member_id", memberId)
    .eq("status", "active")
    .single();

  if (error || !subscription) {
    throw new Error("No active subscription found");
  }

  await cancelSubscription(subscription.stripe_subscription_id);

  // Mark the member as canceling — they still have access until the billing period ends.
  // The Stripe customer.subscription.deleted webhook will set them to "inactive" when
  // the period actually expires.
  await supabase
    .from("members")
    .update({ status: "canceling" })
    .eq("id", memberId);

  redirect(`/unsubscribe/confirmed`);
}
