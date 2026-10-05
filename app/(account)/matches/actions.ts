"use server";

import { createAdminClient } from "@/lib/supabase";
import { requireMember } from "@/lib/require-member";
import { currentMonth, monthToDate } from "@/lib/tokens";
import { generateMatchToken } from "@/lib/match-token";
import { isOptinWindowOpen } from "@/lib/optin-window";
import { debitLatePerksIfRoundCommitted } from "@/lib/match-ledger";
import { resolveCohortOnly } from "@/lib/cohort";
import { hasPerksAccess } from "@/lib/billing-mode";

// ---------------------------------------------------------------------------
// Match exclusions
// ---------------------------------------------------------------------------

export type Exclusion = {
  id: string;
  otherMemberName: string;
  otherMemberEmail: string;
  createdAt: string;
};

export type AddExclusionResult =
  | { success: true; exclusion: Exclusion }
  | { success: false; error: "not_found" | "already_excluded" | "self" };

export async function getExclusions(accessToken: string): Promise<Exclusion[]> {
  const authed = await requireMember(accessToken);
  if (!authed) return [];
  const memberId = authed.memberId;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("match_exclusions")
    .select("id, member_id_1, member_id_2, created_at")
    .or(`member_id_1.eq.${memberId},member_id_2.eq.${memberId}`)
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  // For each row, fetch the other member's name + email
  const results: Exclusion[] = [];
  for (const row of data) {
    const otherId = row.member_id_1 === memberId ? row.member_id_2 : row.member_id_1;
    const { data: other } = await supabase
      .from("members")
      .select("first_name, last_name, email")
      .eq("id", otherId)
      .maybeSingle();

    results.push({
      id: row.id,
      otherMemberName: other ? `${other.first_name} ${other.last_name}` : "Unknown",
      otherMemberEmail: other?.email ?? "",
      createdAt: row.created_at,
    });
  }

  return results;
}

export async function addExclusion(
  accessToken: string,
  email: string,
): Promise<AddExclusionResult> {
  const authed = await requireMember(accessToken);
  if (!authed) return { success: false, error: "not_found" };
  const memberId = authed.memberId;
  const supabase = createAdminClient();

  // Look up the target member by email
  const { data: target } = await supabase
    .from("members")
    .select("id, first_name, last_name, email")
    .eq("email", email.toLowerCase().trim())
    .maybeSingle();

  if (!target) return { success: false, error: "not_found" };
  if (target.id === memberId) return { success: false, error: "self" };

  // Check for an existing exclusion (order-independent)
  const { data: existing } = await supabase
    .from("match_exclusions")
    .select("id")
    .or(
      `and(member_id_1.eq.${memberId},member_id_2.eq.${target.id}),` +
      `and(member_id_1.eq.${target.id},member_id_2.eq.${memberId})`
    )
    .maybeSingle();

  if (existing) return { success: false, error: "already_excluded" };

  // Insert the exclusion
  const { data: inserted, error } = await supabase
    .from("match_exclusions")
    .insert({
      member_id_1: memberId,
      member_id_2: target.id,
      reason: "member_request",
      created_by: "member_request",
    })
    .select("id, created_at")
    .single();

  if (error || !inserted) return { success: false, error: "not_found" };

  return {
    success: true,
    exclusion: {
      id: inserted.id,
      otherMemberName: `${target.first_name} ${target.last_name}`,
      otherMemberEmail: target.email,
      createdAt: inserted.created_at,
    },
  };
}

export async function addExclusionByMemberId(
  accessToken: string,
  targetMemberId: string,
): Promise<{ success: boolean }> {
  const authed = await requireMember(accessToken);
  if (!authed) return { success: false };
  const memberId = authed.memberId;
  const supabase = createAdminClient();

  // Check first — the unique index is order-independent (least/greatest),
  // so upsert with onConflict on raw columns won't resolve it correctly.
  const { data: existing } = await supabase
    .from("match_exclusions")
    .select("id")
    .or(
      `and(member_id_1.eq.${memberId},member_id_2.eq.${targetMemberId}),` +
      `and(member_id_1.eq.${targetMemberId},member_id_2.eq.${memberId})`
    )
    .maybeSingle();

  if (existing) return { success: true };

  const { error } = await supabase
    .from("match_exclusions")
    .insert({
      member_id_1: memberId,
      member_id_2: targetMemberId,
      reason: "member_request",
      created_by: "member_request",
    });

  return { success: !error };
}

export async function deleteExclusion(
  accessToken: string,
  exclusionId: string,
): Promise<{ success: boolean }> {
  const authed = await requireMember(accessToken);
  if (!authed) return { success: false };
  const memberId = authed.memberId;
  const supabase = createAdminClient();

  // Only allow deletion if this member is one of the pair
  const { error } = await supabase
    .from("match_exclusions")
    .delete()
    .eq("id", exclusionId)
    .or(`member_id_1.eq.${memberId},member_id_2.eq.${memberId}`);

  return { success: !error };
}

export type MatchEntry = {
  matchId: string;
  token: string;
  topic: "coffee" | "playdate";
  matchFirstName: string;
  matchLastName: string;
  matchEmail: string;
  matchMemberId: string;
  matchedOn: string;
  active: boolean;
  rematchRequested: boolean;
  rematchRequestedBy: string | null;
  /** This member's own answer to "Did you meet up?" (defaults to "planning"). */
  meetupStatus: MeetupStatus;
  /** Whether this member already submitted feedback tagged with this match. */
  feedbackSubmitted: boolean;
};

export type MatchStatus =
  | { type: "pending"; topic: "coffee" | "playdate"; pastMatches: MatchEntry[] }
  | { type: "matched"; matches: MatchEntry[]; pastMatches: MatchEntry[] }
  | { type: "perks_only"; month: string; pastMatches: MatchEntry[] }
  | { type: "skipped"; month: string; pastMatches: MatchEntry[] }
  | { type: "none"; pastMatches: MatchEntry[] };

/**
 * Returns all matches for a member across all time, plus current-month status.
 * A match is active when it's from the current month AND has no rematch request.
 */
export async function getMatchStatus(accessToken: string): Promise<MatchStatus> {
  const authed = await requireMember(accessToken);
  if (!authed) return { type: "none", pastMatches: [] };
  const memberId = authed.memberId;
  const supabase = createAdminClient();
  const monthDate = monthToDate(currentMonth());

  // Fetch all matches ever for this member
  const { data: rows, error: rowsError } = await supabase
    .from("matches")
    .select(`
      id,
      matched_on,
      rematch_requested,
      rematch_requested_by,
      met_up_status_1,
      met_up_status_2,
      member_id_1,
      member_id_2,
      member1:member_id_1 ( id, first_name, last_name, email ),
      member2:member_id_2 ( id, first_name, last_name, email )
    `)
    .or(`member_id_1.eq.${memberId},member_id_2.eq.${memberId}`)
    .order("matched_on", { ascending: false });

  // Don't fail silently — a bad select (e.g. a column from an unapplied
  // migration) otherwise looks exactly like "this member has no matches".
  if (rowsError) console.error("[getMatchStatus] matches query failed:", rowsError);

  // Look up this member's topic per month from their participation history
  const { data: participationRows } = await supabase
    .from("monthly_participation")
    .select("month, topics(name)")
    .eq("member_id", memberId);

  // Match ids this member has already left feedback on (match_feedback.match_ids)
  const { data: feedbackRows } = await supabase
    .from("match_feedback")
    .select("match_ids")
    .eq("member_id", memberId);
  const feedbackMatchIds = new Set<string>(
    (feedbackRows ?? []).flatMap((r) => (r.match_ids as string[] | null) ?? [])
  );

  const topicByMonth = new Map<string, string>(
    (participationRows ?? []).map((p) => [
      p.month,
      ((p.topics as unknown as { name: string } | null)?.name ?? "coffee"),
    ])
  );

  const allMatches: MatchEntry[] = (rows ?? []).map((match) => {
    const isM1 = match.member_id_1 === memberId;
    const partnerRaw = isM1 ? match.member2 : match.member1;
    const partnerData = Array.isArray(partnerRaw) ? partnerRaw[0] : partnerRaw;
    const isCurrentMonth = match.matched_on >= monthDate;
    const partner = partnerData as { id: string; first_name: string; last_name: string; email: string } | null;
    return {
      matchId: match.id,
      token: generateMatchToken(match.id),
      topic: (topicByMonth.get(match.matched_on) ?? "coffee") as "coffee" | "playdate",
      matchFirstName: partner?.first_name ?? "",
      matchLastName: partner?.last_name ?? "",
      matchEmail: partner?.email ?? "",
      matchMemberId: isM1 ? match.member_id_2 : match.member_id_1,
      matchedOn: match.matched_on,
      active: isCurrentMonth,
      rematchRequested: !!match.rematch_requested,
      rematchRequestedBy: match.rematch_requested_by ?? null,
      meetupStatus: ((isM1 ? match.met_up_status_1 : match.met_up_status_2) ?? "planning") as MeetupStatus,
      feedbackSubmitted: feedbackMatchIds.has(match.id),
    };
  });

  const currentMatches = allMatches.filter((m) => m.active);
  const pastMatches = allMatches.filter((m) => !m.active);

  if (currentMatches.length) {
    return { type: "matched", matches: currentMatches, pastMatches };
  }

  // Check for opt-in participation this month (no match yet)
  const { data: participation } = await supabase
    .from("monthly_participation")
    .select("topic_id, topics ( name )")
    .eq("member_id", memberId)
    .eq("month", monthDate)
    .maybeSingle();

  if (participation) {
    const topicName = (participation.topics as unknown as { name: string } | null)?.name;
    return {
      type: "pending",
      topic: (topicName === "playdate" ? "playdate" : "coffee") as "coffee" | "playdate",
      pastMatches,
    };
  }

  // "No match, just perks" this month -- see lib/monthly-opt-in.ts and
  // db/migrations/029_monthly_perks.sql. Checked before skip since a real
  // answer like this is what the skip branch below is for -- a member
  // can't have both a monthly_perks and monthly_skips row for the same
  // month (optInFromMatches/optin route clear the skip row when this is
  // chosen), but checking order-independent is cheap insurance either way.
  const { data: perksOnly } = await supabase
    .from("monthly_perks")
    .select("month")
    .eq("member_id", memberId)
    .eq("month", monthDate)
    .maybeSingle();

  if (perksOnly) {
    return { type: "perks_only", month: monthDate, pastMatches };
  }

  // Check if they skipped this month
  const { data: skip } = await supabase
    .from("monthly_skips")
    .select("month")
    .eq("member_id", memberId)
    .eq("month", monthDate)
    .maybeSingle();

  if (skip) {
    return { type: "skipped", month: monthDate, pastMatches };
  }

  return { type: "none", pastMatches };
}

// ---------------------------------------------------------------------------
// Meetup check-in — "Did you meet up with <name>?" on the /matches card.
// Each member answers for their own side of the match (met_up_status_1 for
// member_id_1, met_up_status_2 for member_id_2); the other side's answer is
// never touched.
// ---------------------------------------------------------------------------

export type MeetupStatus = "planning" | "met" | "not_met";

const MEETUP_STATUSES: readonly MeetupStatus[] = ["planning", "met", "not_met"];

export type SetMeetupStatusResult =
  | { success: true }
  | { success: false; error: "invalid" | "not_found" | "rematch_requested" | "server_error" };

export async function setMeetupStatus(
  accessToken: string,
  matchId: string,
  status: MeetupStatus,
): Promise<SetMeetupStatusResult> {
  if (!MEETUP_STATUSES.includes(status)) return { success: false, error: "invalid" };

  const authed = await requireMember(accessToken);
  if (!authed) return { success: false, error: "not_found" };
  const memberId = authed.memberId;
  const supabase = createAdminClient();

  const { data: match } = await supabase
    .from("matches")
    .select("id, member_id_1, member_id_2, rematch_requested")
    .eq("id", matchId)
    .maybeSingle();

  // Same "not found" whether the match doesn't exist or isn't theirs, so the
  // action can't be used to probe other members' match ids.
  if (!match || (match.member_id_1 !== memberId && match.member_id_2 !== memberId)) {
    return { success: false, error: "not_found" };
  }

  // Current and past matches can both be checked in on; a rematch-requested
  // match can't (mirrors the card, which hides the strip for those).
  if (match.rematch_requested) {
    return { success: false, error: "rematch_requested" };
  }

  const side = match.member_id_1 === memberId ? 1 : 2;
  const { error } = await supabase
    .from("matches")
    .update({ [`met_up_status_${side}`]: status })
    .eq("id", matchId);

  if (error) {
    console.error("[setMeetupStatus] update error:", error);
    return { success: false, error: "server_error" };
  }
  return { success: true };
}

// ---------------------------------------------------------------------------
// In-app opt-in — lets a member join the match pool from /matches instead of
// waiting for (or in addition to) the emailed opt-in link. Mirrors the
// coffee/playdate/skip logic in /api/optin/route.ts.
// ---------------------------------------------------------------------------

export type OptInAction = "coffee" | "playdate" | "perks" | "skip";

export type OptInResult =
  | { success: true }
  | { success: false; error: "closed" | "already_responded" | "no_balance" | "perks_unavailable" | "server_error" };

/**
 * Records a member's response for the month: coffee/playdate (joins the
 * matcher pool via monthly_participation), "perks" (Post Perks access
 * without matching — monthly_perks, see lib/monthly-opt-in.ts and
 * db/migrations/029_monthly_perks.sql), or skip.
 *
 * coffee/playdate/skip close after the 5th (isOptinWindowOpen) -- perks
 * doesn't, since it needs no matcher round to mean anything.
 *
 * A member who already skipped this month CAN still change to
 * coffee/playdate/perks (deletes the stale monthly_skips row and resets
 * consecutive_skips, same as any other opt-in) -- but a real opt-in
 * (participation or perks) is final for the month, and a second skip is a
 * no-op "already responded" rather than a fresh skip. This mirrors
 * coffee/playdate/skip logic in /api/optin/route.ts, except that route's
 * one-click email links additionally allow a skip -> * override there too;
 * kept consistent here for the same reason (a member changing their mind
 * mid-window shouldn't be told they already answered).
 */
export async function optInFromMatches(
  accessToken: string,
  action: OptInAction,
  requestedCohortOnly = false
): Promise<OptInResult> {
  // Matching itself closes after the 5th, but perks-only doesn't need a
  // matcher round to mean anything -- it stays available all month (the
  // /my-perks prompt and the closed-window /matches card both rely on
  // this to let a member "Get your Perks" any time after the deadline).
  if (!isOptinWindowOpen() && action !== "perks") {
    return { success: false, error: "closed" };
  }

  const authed = await requireMember(accessToken);
  if (!authed) return { success: false, error: "server_error" };
  const memberId = authed.memberId;
  const supabase = createAdminClient();
  const monthDate = monthToDate(currentMonth());

  const { data: memberRow } = await supabase
    .from("members")
    .select("consecutive_skips, matches_remaining, billing_mode")
    .eq("id", memberId)
    .single();

  if (!memberRow) return { success: false, error: "server_error" };

  // Comped members without Perks can't take the perks-only choice.
  if (action === "perks" && !hasPerksAccess(memberRow.billing_mode)) {
    return { success: false, error: "perks_unavailable" };
  }

  const [{ data: existingSkip }, { data: existingParticipation }, { data: existingPerks }] = await Promise.all([
    supabase.from("monthly_skips").select("id").eq("member_id", memberId).eq("month", monthDate).maybeSingle(),
    supabase.from("monthly_participation").select("id").eq("member_id", memberId).eq("month", monthDate).maybeSingle(),
    supabase.from("monthly_perks").select("id").eq("member_id", memberId).eq("month", monthDate).maybeSingle(),
  ]);

  // A real opt-in (matched or perks-only) is final for the month.
  if (existingParticipation || existingPerks) {
    return { success: false, error: "already_responded" };
  }

  // Re-skipping an already-skipped month is a no-op, not a fresh skip.
  if (existingSkip && action === "skip") {
    return { success: false, error: "already_responded" };
  }

  if (action === "skip") {
    const { error: skipError } = await supabase
      .from("monthly_skips")
      .insert({ member_id: memberId, month: monthDate });
    if (skipError) return { success: false, error: "server_error" };

    await supabase
      .from("members")
      .update({ consecutive_skips: memberRow.consecutive_skips + 1 })
      .eq("id", memberId);

    return { success: true };
  }

  // coffee, playdate, or perks — Track E3: gate on the counter, same as
  // /api/optin/route.ts. Skip stays free regardless of balance; perks-only
  // consumes a credit exactly like a real match (commit-matches records a
  // 'perks_only' entitlement event for it).
  if ((memberRow.matches_remaining ?? 0) <= 0) {
    return { success: false, error: "no_balance" };
  }

  // Changing their mind from a skip to a real answer -- clear the stale
  // skip row first so it can't double-count as both "skipped" and "opted
  // in" (admin stats reads monthly_skips' row count directly).
  if (existingSkip) {
    await supabase.from("monthly_skips").delete().eq("member_id", memberId).eq("month", monthDate);
  }

  if (action === "perks") {
    const { error: perksError } = await supabase
      .from("monthly_perks")
      .insert({ member_id: memberId, month: monthDate });

    if (perksError) {
      if (perksError.code === "23505") return { success: false, error: "already_responded" };
      return { success: false, error: "server_error" };
    }

    await supabase.from("members").update({ consecutive_skips: 0 }).eq("id", memberId);
    // A no-op unless this month's round already committed -- see the
    // function's own doc comment for why that sweep can't catch this.
    await debitLatePerksIfRoundCommitted(supabase, memberId, monthDate);
    return { success: true };
  }

  const { data: topic, error: topicError } = await supabase
    .from("topics")
    .select("id")
    .eq("name", action)
    .maybeSingle();

  if (topicError || !topic) return { success: false, error: "server_error" };

  // Comped cohort members are always matched inside their cohort; other
  // cohort members get what they asked for (the editable checkbox ships later).
  let cohortOnly: boolean;
  try {
    cohortOnly = await resolveCohortOnly(supabase, memberId, requestedCohortOnly);
  } catch (e) {
    console.error("[optInFromMatches] cohort lookup failed:", e);
    return { success: false, error: "server_error" };
  }

  const { error: participationError } = await supabase
    .from("monthly_participation")
    .insert({ member_id: memberId, month: monthDate, topic_id: topic.id, cohort_only: cohortOnly });

  if (participationError) {
    // Unique constraint violation — member already responded this month
    if (participationError.code === "23505") {
      return { success: false, error: "already_responded" };
    }
    return { success: false, error: "server_error" };
  }

  await supabase.from("members").update({ consecutive_skips: 0 }).eq("id", memberId);

  return { success: true };
}
