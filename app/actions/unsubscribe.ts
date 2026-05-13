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

  await supabase
    .from("subscriptions")
    .update({ status: "canceled" })
    .eq("stripe_subscription_id", subscription.stripe_subscription_id);

  await supabase
    .from("members")
    .update({ status: "inactive" })
    .eq("id", memberId);

  redirect(`/unsubscribe/confirmed`);
}
