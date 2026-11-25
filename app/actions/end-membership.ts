"use server";

import { createAdminClient } from "@/lib/supabase";
import { requireMember } from "@/lib/require-member";
import { endMembership } from "@/lib/end-membership";

export type EndMembershipResult =
  | { ok: true; forfeited: number }
  | { ok: false; reason: "not_authenticated" | "not_canceling" | "failed" };

/**
 * "I'm done" for a member who has already canceled: forfeits whatever rounds
 * they have left and takes them out of this month's pool (see
 * lib/end-membership.ts for exactly what that does).
 *
 * Cancel (unsubscribe.ts) only stops billing and deliberately keeps the
 * member's remaining rounds, so a canceling member keeps getting opt-in
 * emails until the counter runs out. This is the explicit way to stop
 * participating now instead. Forfeiting paid-for rounds must never be a side
 * effect of canceling, so it is only reached by an explicit choice: this
 * action, or unsubscribe()'s endNow option.
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
      .select("status")
      .eq("id", memberId)
      .single();
    if (memberError || !member) throw new Error(`member lookup failed: ${memberError?.message}`);

    // Already gone: nothing to do (double click, or the webhook got there first).
    if (member.status === "inactive") return { ok: true, forfeited: 0 };
    if (member.status !== "canceling") return { ok: false, reason: "not_canceling" };

    const { forfeited } = await endMembership(supabase, memberId);
    return { ok: true, forfeited };
  } catch (e) {
    console.error("[endMembershipNow] failed:", e);
    return { ok: false, reason: "failed" };
  }
}
