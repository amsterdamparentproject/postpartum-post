"use server";

import { redirect } from "next/navigation";
import { cancelSubscription } from "@/lib/subscription-utils";
import { createAdminClient } from "@/lib/supabase";
import { sendCancellationConfirmedEmail } from "@/lib/emails";

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

  const { periodEnd } = await cancelSubscription(subscription.stripe_subscription_id);

  // Mark the member as canceling — they still have access until the billing period ends.
  // The Stripe customer.subscription.deleted webhook will set them to "inactive" when
  // the period actually expires.
  await supabase
    .from("members")
    .update({ status: "canceling" })
    .eq("id", memberId);

  // Immediate confirmation — compliance requirement from the Track E cutover review:
  // members previously heard nothing until the subscription actually deleted weeks
  // later. Non-fatal: a failed send shouldn't block the cancellation itself.
  const { data: member } = await supabase
    .from("members")
    .select("email, first_name")
    .eq("id", memberId)
    .single();

  if (member?.email) {
    try {
      await sendCancellationConfirmedEmail(member.email, member.first_name ?? "there", periodEnd);
    } catch (e) {
      console.error("[unsubscribe] sendCancellationConfirmedEmail failed (non-fatal):", e);
    }
  }

  redirect(`/unsubscribe/confirmed?until=${encodeURIComponent(periodEnd.toISOString())}`);
}
