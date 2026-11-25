"use server";

import { createAdminClient } from "@/lib/supabase";
import { requireMember } from "@/lib/require-member";
import { recordEntitlement } from "@/lib/match-ledger";
import { monthToDate, currentMonth } from "@/lib/tokens";

export type EndMembershipResult =
  | { ok: true; forfeited: number }
  | { ok: false; reason: "not_authenticated" | "not_canceling" | "failed" };

/**
 * "I'm done" for a member who has already canceled: forfeits whatever rounds
 * they have left and takes them out of this month's pool.
 *
 * Cancel (unsubscribe.ts) only stops billing and deliberately keeps the
 * member's remaining rounds, so a canceling member keeps getting opt-in
 * emails until the counter runs out. This is the explicit way to stop
 * participating now instead. It is separate from cancel on purpose: forfeiting
 * paid-for rounds must never be a side effect of canceling.
 *
 * Database only, no Stripe call. Cancel already paused collection, so the
 * member can't be billed. For a member with a live subscription we leave the
 * status at "canceling" and let renew-check finalize it: it cancels the
 * subscription once the counter is 0, and the deletion webhook then sets
 * "inactive". A member with no live subscription left gets no such event, so
 * they are set "inactive" here.
 *
 * Only a "canceling" member can do this; an active member has to cancel first.
 * Safe to call twice.
 */
export async function endMembershipNow(accessToken: string): Promise<EndMembershipResult> {
  // Identity comes from the verified session, never a client-supplied id.
  const authed = await requireMember(accessToken);
  if (!authed) return { ok: false, reason: "not_authenticated" };
  const memberId = authed.memberId;

  const supabase = createAdminClient();

  try {
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("status, matches_remaining")
      .eq("id", memberId)
      .single();
    if (memberError || !member) throw new Error(`member lookup failed: ${memberError?.message}`);

    // Already gone: nothing to do (double click, or the webhook got there first).
    if (member.status === "inactive") return { ok: true, forfeited: 0 };
    if (member.status !== "canceling") return { ok: false, reason: "not_canceling" };

    const forfeited = Math.max(member.matches_remaining ?? 0, 0);
    if (forfeited > 0) {
      // record_entitlement() floors the counter at zero, so a decrement landing
      // between the read above and this write can't push it negative.
      const written = await recordEntitlement(supabase, {
        memberId,
        event: "canceled",
        delta: -forfeited,
        note: "member ended membership early; remaining rounds forfeited",
      });
      if (!written) throw new Error("forfeit ledger entry was rejected as a duplicate");
    }

    // Pull them out of this month's pool, but only while the round is still
    // open. Once it's committed the participation row is the record of what
    // already happened (and the member may have a live match), so leave it.
    const month = monthToDate(currentMonth());
    const { data: round, error: roundError } = await supabase
      .from("match_rounds")
      .select("status")
      .eq("month", month)
      .maybeSingle();
    if (roundError) throw new Error(`round lookup failed: ${roundError.message}`);
    if (!round || round.status === "draft") {
      const { error: deleteError } = await supabase
        .from("monthly_participation")
        .delete()
        .eq("member_id", memberId)
        .eq("month", month);
      if (deleteError) throw new Error(`clearing participation failed: ${deleteError.message}`);
    }

    // No live subscription means no deletion event is coming (it was already
    // deleted while they still had rounds, and the webhook left them
    // "canceling"). Nothing else would ever finalize them, so do it here.
    const { data: liveSub, error: subError } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("member_id", memberId)
      .neq("status", "canceled")
      .limit(1)
      .maybeSingle();
    if (subError) throw new Error(`subscription lookup failed: ${subError.message}`);
    if (!liveSub) {
      const { error: statusError } = await supabase
        .from("members")
        .update({ status: "inactive" })
        .eq("id", memberId);
      if (statusError) throw new Error(`setting inactive failed: ${statusError.message}`);
    }

    return { ok: true, forfeited };
  } catch (e) {
    console.error("[endMembershipNow] failed:", e);
    return { ok: false, reason: "failed" };
  }
}
