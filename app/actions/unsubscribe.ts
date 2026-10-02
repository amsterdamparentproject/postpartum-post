"use server";

import { redirect } from "next/navigation";
import { pauseSubscriptionCollection } from "@/lib/subscription-utils";
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

  // Stripe only collects money; the matches_remaining counter alone decides
  // access (billing-simplification-plan.md). So cancelling does NOT schedule a
  // Stripe-side cancellation (cancel_at_period_end): Stripe would delete the
  // subscription on its own date, and the deletion webhook would end the
  // member's access while matches they paid for were still unspent. Instead
  // we make sure Stripe can never bill them again (pause, idempotent) and
  // mark them "canceling"; renew-check cancels the subscription once their
  // counter hits zero, which fires the webhook that sets them "inactive".
  await pauseSubscriptionCollection(subscription.stripe_subscription_id);

  await supabase
    .from("members")
    .update({ status: "canceling" })
    .eq("id", memberId);

  // Immediate confirmation — compliance requirement from the Track E cutover review:
  // members previously heard nothing until the subscription actually deleted weeks
  // later. Non-fatal: a failed send shouldn't block the cancellation itself.
  const { data: member } = await supabase
    .from("members")
    .select("email, first_name, matches_remaining")
    .eq("id", memberId)
    .single();

  const matchesRemaining = Math.max(member?.matches_remaining ?? 0, 0);

  if (member?.email) {
    try {
      await sendCancellationConfirmedEmail(member.email, member.first_name ?? "there", matchesRemaining);
    } catch (e) {
      console.error("[unsubscribe] sendCancellationConfirmedEmail failed (non-fatal):", e);
    }
  }

  redirect(`/unsubscribe/confirmed?matches=${matchesRemaining}`);
}
