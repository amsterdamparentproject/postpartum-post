"use server";

import { redirect } from "next/navigation";
import { getStripe } from "@/lib/stripe";
import { pauseSubscriptionCollection } from "@/lib/subscription-utils";
import { createAdminClient } from "@/lib/supabase";
import { requireMember } from "@/lib/require-member";
import { sendCancellationConfirmedEmail } from "@/lib/emails";

export async function unsubscribe(accessToken: string) {
  // Identity comes from the verified session, never a client-supplied id
  // (security audit Finding 1; this action was missed in the original sweep).
  const authed = await requireMember(accessToken);
  if (!authed) throw new Error("Not authenticated");
  const memberId = authed.memberId;

  const supabase = createAdminClient();

  // A paused member (3 skips in a row) isn't in rounds. Cancelling them via
  // "canceling" would put them back into rounds, so they get their own flows:
  // cancelPausedMembership() or resumeMatching().
  const { data: current } = await supabase
    .from("members")
    .select("status")
    .eq("id", memberId)
    .single();
  if (current?.status === "paused") {
    throw new Error("Member is paused; use cancelPausedMembership or resumeMatching");
  }

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

/**
 * Cancel for a member whose matching is paused (auto-paused after 3 skips).
 * They aren't in any round, so there's nothing to wind down: access ends now.
 * Any matches they had left are forfeited (the confirmation UI says so; the
 * alternative on offer is resumeMatching()).
 */
export async function cancelPausedMembership(accessToken: string) {
  const authed = await requireMember(accessToken);
  if (!authed) throw new Error("Not authenticated");
  const memberId = authed.memberId;

  const supabase = createAdminClient();

  const { data: member } = await supabase
    .from("members")
    .select("status, email, first_name")
    .eq("id", memberId)
    .single();
  if (member?.status !== "paused") {
    throw new Error("Member is not paused");
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("member_id", memberId)
    .eq("status", "active")
    .maybeSingle();

  // Mark inactive first so the subscription.deleted webhook sees an already
  // inactive member and doesn't send a second email. Restore on Stripe failure.
  await supabase.from("members").update({ status: "inactive" }).eq("id", memberId);

  if (subscription?.stripe_subscription_id) {
    try {
      await getStripe().subscriptions.cancel(subscription.stripe_subscription_id, {
        invoice_now: false,
        prorate: false,
      });
    } catch (e) {
      await supabase.from("members").update({ status: "paused" }).eq("id", memberId);
      throw e;
    }
  }

  if (member.email) {
    try {
      await sendCancellationConfirmedEmail(member.email, member.first_name ?? "there", 0);
    } catch (e) {
      console.error("[cancelPausedMembership] confirmation email failed (non-fatal):", e);
    }
  }

  redirect("/unsubscribe/confirmed?matches=0");
}

export type ResumeResult = { status: "ok" | "not_paused" | "no_matches_left" | "unauthenticated" };

/**
 * Put a paused member back into rounds. Stripe stays paused (it only collects
 * at renew-check). A member with no matches left is NOT resumed here: as an
 * `active` member at zero, renew-check would bill them on the next 10th even if
 * they'd missed that month's opt-in window, so that case goes through support.
 */
export async function resumeMatching(accessToken: string): Promise<ResumeResult> {
  const authed = await requireMember(accessToken);
  if (!authed) return { status: "unauthenticated" };
  const memberId = authed.memberId;

  const supabase = createAdminClient();

  const { data: member } = await supabase
    .from("members")
    .select("status, matches_remaining")
    .eq("id", memberId)
    .single();
  if (member?.status !== "paused") return { status: "not_paused" };
  if ((member.matches_remaining ?? 0) <= 0) return { status: "no_matches_left" };

  await supabase
    .from("members")
    .update({ status: "active", consecutive_skips: 0 })
    .eq("id", memberId);

  return { status: "ok" };
}
