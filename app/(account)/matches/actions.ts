"use server";

import { createAdminClient } from "@/lib/supabase";
import { currentMonth, monthToDate } from "@/lib/tokens";
import { generateMatchToken } from "@/lib/match-token";

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

export async function getExclusions(memberId: string): Promise<Exclusion[]> {
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
  memberId: string,
  email: string,
): Promise<AddExclusionResult> {
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
  memberId: string,
  targetMemberId: string,
): Promise<{ success: boolean }> {
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
  memberId: string,
  exclusionId: string,
): Promise<{ success: boolean }> {
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
};

export type MatchStatus =
  | { type: "pending"; topic: "coffee" | "playdate"; pastMatches: MatchEntry[] }
  | { type: "matched"; matches: MatchEntry[]; pastMatches: MatchEntry[] }
  | { type: "skipped"; month: string; pastMatches: MatchEntry[] }
  | { type: "none"; pastMatches: MatchEntry[] };

/**
 * Returns all matches for a member across all time, plus current-month status.
 * A match is active when it's from the current month AND has no rematch request.
 */
export async function getMatchStatus(memberId: string): Promise<MatchStatus> {
  const supabase = createAdminClient();
  const monthDate = monthToDate(currentMonth());

  // Fetch all matches ever for this member
  const { data: rows } = await supabase
    .from("matches")
    .select(`
      id,
      matched_on,
      rematch_requested,
      rematch_requested_by,
      member_id_1,
      member_id_2,
      member1:member_id_1 ( id, first_name, last_name, email ),
      member2:member_id_2 ( id, first_name, last_name, email )
    `)
    .or(`member_id_1.eq.${memberId},member_id_2.eq.${memberId}`)
    .order("matched_on", { ascending: false });

  // Look up this member's topic per month from their participation history
  const { data: participationRows } = await supabase
    .from("monthly_participation")
    .select("month, topics(name)")
    .eq("member_id", memberId);

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
// In-app opt-in — lets a member join the match pool from /matches instead of
// waiting for (or in addition to) the emailed opt-in link. Mirrors the
// coffee/playdate/skip logic in /api/optin/route.ts.
// ---------------------------------------------------------------------------

export type OptInAction = "coffee" | "playdate" | "skip";

export type OptInResult =
  | { success: true }
  | { success: false; error: "closed" | "already_responded" | "server_error" };

/** Opt-in window closes after this day of the month (matches the emailed deadline). */
const OPTIN_DEADLINE_DAY = 5;

export async function optInFromMatches(
  memberId: string,
  action: OptInAction
): Promise<OptInResult> {
  if (new Date().getDate() > OPTIN_DEADLINE_DAY) {
    return { success: false, error: "closed" };
  }

  const supabase = createAdminClient();
  const monthDate = monthToDate(currentMonth());

  const { data: memberRow } = await supabase
    .from("members")
    .select("consecutive_skips")
    .eq("id", memberId)
    .single();

  if (!memberRow) return { success: false, error: "server_error" };

  // Don't allow silently overwriting an existing response for the month
  const [{ data: existingSkip }, { data: existingParticipation }] = await Promise.all([
    supabase.from("monthly_skips").select("id").eq("member_id", memberId).eq("month", monthDate).maybeSingle(),
    supabase.from("monthly_participation").select("id").eq("member_id", memberId).eq("month", monthDate).maybeSingle(),
  ]);

  if (existingSkip || existingParticipation) {
    return { success: false, error: "already_responded" };
  }

  if (action === "skip") {
    const { error: skipError } = await supabase
      .from("monthly_skips")
      .insert({ member_id: memberId, month: monthDate });
    if (skipError) return { success: false, error: "server_error" };

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("member_id", memberId)
      .eq("status", "active")
      .maybeSingle();

    if (sub?.stripe_subscription_id) {
      const { extendSubscriptionToNext5th } = await import("@/lib/subscription-utils");
      await extendSubscriptionToNext5th(sub.stripe_subscription_id);
    }

    await supabase
      .from("members")
      .update({ consecutive_skips: memberRow.consecutive_skips + 1 })
      .eq("id", memberId);

    return { success: true };
  }

  // coffee or playdate
  const { data: topic, error: topicError } = await supabase
    .from("topics")
    .select("id")
    .eq("name", action)
    .maybeSingle();

  if (topicError || !topic) return { success: false, error: "server_error" };

  const { error: participationError } = await supabase
    .from("monthly_participation")
    .insert({ member_id: memberId, month: monthDate, topic_id: topic.id });

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
