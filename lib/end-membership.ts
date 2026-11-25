import { createAdminClient } from "@/lib/supabase";
import { recordEntitlement } from "@/lib/match-ledger";
import { monthToDate, currentMonth } from "@/lib/tokens";

type Supabase = ReturnType<typeof createAdminClient>;

/**
 * The shared core of "end a membership now": forfeits whatever rounds the
 * member has left and takes them out of this month's pool. Used by the
 * endMembershipNow action (a member who already canceled) and by unsubscribe()
 * (cancel and end in one step). Callers have already verified the member and
 * set their status to "canceling".
 *
 * Database only, no Stripe call. Cancel already paused collection, so the
 * member can't be billed. For a member with a live subscription the status
 * stays "canceling" and renew-check finalizes it: it cancels the subscription
 * once the counter is 0, and the deletion webhook then sets "inactive". A
 * member with no live subscription left gets no such event, so they are set
 * "inactive" here.
 *
 * Throws on any failure, so callers decide how to report it.
 */
export async function endMembership(supabase: Supabase, memberId: string): Promise<{ forfeited: number }> {
  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("matches_remaining")
    .eq("id", memberId)
    .single();
  if (memberError || !member) throw new Error(`member lookup failed: ${memberError?.message}`);

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

  return { forfeited };
}
