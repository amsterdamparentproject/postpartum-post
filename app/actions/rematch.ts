"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase";
import { sendRematchConfirmationEmail } from "@/lib/emails/rematch-confirmation";
import { requireMember } from "@/lib/require-member";
import { recordEntitlement } from "@/lib/match-ledger";
import { REPORT_CREDIT_REASONS } from "@/lib/report-credit";
import { currentMonth, monthToDate } from "@/lib/skip-token";

export type ActiveMatch = {
  matchId: string;
  partnerFirstName: string;
  partnerLastName: string;
  partnerEmail: string;
};

/** This month's rematch-eligible matches for the signed-in member. */
export async function getRematchMatches(accessToken: string): Promise<ActiveMatch[]> {
  const authed = await requireMember(accessToken);
  if (!authed) return [];
  const memberId = authed.memberId;

  const supabase = createAdminClient();
  const monthDate = monthToDate(currentMonth());

  const { data } = await supabase
    .from("matches")
    .select(`
      id,
      member_id_1,
      member_id_2,
      rematch_requested,
      member1:member_id_1 ( first_name, last_name, email ),
      member2:member_id_2 ( first_name, last_name, email )
    `)
    .or(`member_id_1.eq.${memberId},member_id_2.eq.${memberId}`)
    .gte("matched_on", monthDate)
    .eq("rematch_requested", false);

  return (data ?? []).map((match) => {
    const isM1 = match.member_id_1 === memberId;
    const partnerRaw = isM1 ? match.member2 : match.member1;
    const partner = Array.isArray(partnerRaw) ? partnerRaw[0] : partnerRaw;
    return {
      matchId: match.id,
      partnerFirstName: (partner as { first_name: string })?.first_name ?? "",
      partnerLastName: (partner as { last_name: string })?.last_name ?? "",
      partnerEmail: (partner as { email: string })?.email ?? "",
    };
  });
}

/**
 * "Report a problem" with a match. Historically named requestRematch: it no
 * longer promises a new match this month. It ends the match, permanently
 * excludes the pair, flags safety reasons for review, and credits +1 match for
 * the reasons in REPORT_CREDIT_REASONS. The page lives at /report; the old
 * /rematch URL is intentionally gone.
 */
export async function requestRematch(accessToken: string, reason: string | null, matchId?: string) {
  // Identity comes from the verified session, never a client-supplied member id
  // (security audit Finding 1): otherwise anyone holding a member id could file
  // a rematch, and an exclusion, on that member's behalf.
  const authed = await requireMember(accessToken);
  if (!authed) throw new Error("Not authenticated");
  const memberId = authed.memberId;

  const supabase = createAdminClient();

  // Use the provided matchId, or fall back to the most recent current-month match
  let match: { id: string; member_id_1: string; member_id_2: string; rematch_requested?: boolean | null } | null = null;

  if (matchId) {
    const { data, error } = await supabase
      .from("matches")
      .select("id, member_id_1, member_id_2, rematch_requested")
      .eq("id", matchId)
      .or(`member_id_1.eq.${memberId},member_id_2.eq.${memberId}`)
      .single();
    if (error || !data) throw new Error("Match not found");
    match = data;
  } else {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const { data, error } = await supabase
      .from("matches")
      .select("id, member_id_1, member_id_2, rematch_requested")
      .or(`member_id_1.eq.${memberId},member_id_2.eq.${memberId}`)
      .gte("matched_on", startOfMonth.toISOString().split("T")[0])
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (error || !data) throw new Error("No match found for this month");
    match = data;
  }

  // Already reported (double-click, or the other member got there first): the
  // exclusion and any credit were handled the first time, so do nothing twice.
  if (match.rematch_requested) {
    redirect("/report/confirmed");
  }

  await supabase
    .from("matches")
    .update({
      rematch_requested: true,
      rematch_reason: reason,
      rematch_requested_at: new Date().toISOString(),
      rematch_requested_by: memberId,
      flagged_for_review: reason === "safety_concern" || reason === "harassment",
    })
    .eq("id", match.id);

  // Look up the requesting member's name and email for the confirmation email.
  const { data: requestingMember } = await supabase
    .from("members")
    .select("first_name, email")
    .eq("id", memberId)
    .single();

  // Permanently exclude this pair from future matches.
  // Check first to avoid hitting the order-independent unique index with a raw-column upsert.
  const { data: existing } = await supabase
    .from("match_exclusions")
    .select("id")
    .or(
      `and(member_id_1.eq.${match.member_id_1},member_id_2.eq.${match.member_id_2}),` +
      `and(member_id_1.eq.${match.member_id_2},member_id_2.eq.${match.member_id_1})`
    )
    .maybeSingle();

  if (!existing) {
    await supabase
      .from("match_exclusions")
      .insert({
        member_id_1: match.member_id_1,
        member_id_2: match.member_id_2,
        reason: "rematch_request",
        created_by: "rematch_request",
      });
  }

  // Credit the match they already spent. Non-fatal: a ledger hiccup must not
  // undo or block the report itself, but it is logged loudly.
  let credited = false;
  if (reason && REPORT_CREDIT_REASONS.has(reason)) {
    try {
      credited = await recordEntitlement(supabase, {
        memberId,
        event: "manual_grant",
        delta: 1,
        matchId: match.id,
        note: `report_credit:${reason}`,
      });
    } catch (err) {
      console.error(`[report] credit failed for member ${memberId}, match ${match.id}:`, err);
    }
  }

  if (requestingMember) {
    await sendRematchConfirmationEmail(requestingMember.email, requestingMember.first_name, credited).catch(
      (err) => console.error("[report] confirmation email failed:", err)
    );
  }

  redirect(credited ? "/report/confirmed?credited=1" : "/report/confirmed");
}
