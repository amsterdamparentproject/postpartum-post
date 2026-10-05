"use server";

import { redirect } from "next/navigation";
import { pauseSubscriptionCollection } from "@/lib/subscription-utils";
import { createAdminClient } from "@/lib/supabase";
import { requireMember } from "@/lib/require-member";
import { sendCancellationConfirmedEmail } from "@/lib/emails";
import { isComped } from "@/lib/billing-mode";
import { recordEntitlement } from "@/lib/match-ledger";
import { monthToDate, currentMonth } from "@/lib/tokens";

export async function unsubscribe(accessToken: string) {
  // Identity comes from the verified session, never a client-supplied id
  // (security audit Finding 1; this action was missed in the original sweep).
  const authed = await requireMember(accessToken);
  if (!authed) throw new Error("Not authenticated");
  const memberId = authed.memberId;

  const supabase = createAdminClient();

  const { data: subscription, error } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("member_id", memberId)
    .eq("status", "active")
    .single();

  if (error || !subscription) {
    // Comped cohort members (billing_mode comped_*) have no Stripe
    // subscription at all, so there's nothing to pause: they leave at once.
    const { data: billing } = await supabase
      .from("members")
      .select("billing_mode")
      .eq("id", memberId)
      .single();
    if (isComped(billing?.billing_mode)) {
      await cancelCompedMember(supabase, memberId);
    }
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

/**
 * Cancels a comped member (no subscription, nothing in Stripe). They become
 * inactive immediately and forfeit any unused free credit, and they're pulled
 * out of this month's matcher pool so they can't be matched after leaving.
 * Always redirects.
 */
async function cancelCompedMember(
  supabase: ReturnType<typeof createAdminClient>,
  memberId: string
): Promise<never> {
  const { data: member } = await supabase
    .from("members")
    .select("email, first_name, matches_remaining")
    .eq("id", memberId)
    .single();

  const forfeited = Math.max(member?.matches_remaining ?? 0, 0);
  if (forfeited > 0) {
    try {
      await recordEntitlement(supabase, {
        memberId,
        event: "canceled",
        delta: -forfeited,
        note: "comped member canceled; unused free credit forfeited",
      });
    } catch (e) {
      console.error("[unsubscribe] forfeiting comped credit failed (non-fatal):", e);
    }
  }

  await supabase
    .from("monthly_participation")
    .delete()
    .eq("member_id", memberId)
    .eq("month", monthToDate(currentMonth()));

  await supabase.from("members").update({ status: "inactive" }).eq("id", memberId);

  if (member?.email) {
    try {
      await sendCancellationConfirmedEmail(member.email, member.first_name ?? "there", 0);
    } catch (e) {
      console.error("[unsubscribe] sendCancellationConfirmedEmail failed (non-fatal):", e);
    }
  }

  redirect("/unsubscribe/confirmed?matches=0");
}
