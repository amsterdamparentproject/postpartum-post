"use server";

import { createAdminClient } from "@/lib/supabase";
import { headers } from "next/headers";
import { currentMonth, monthToDate } from "@/lib/tokens";
import { scorePair, maxAchievableScore, qualityTier, getLastMatchedMap, type MatchCandidate } from "@/lib/matcher";
import { ALEX_TEST_EMAIL, ensureAlexPastMatches } from "@/lib/test-fixtures/alex-past-matches";
import { generateMatchToken } from "@/lib/match-token";
import { generateMagicLinkWithRetry } from "@/lib/supabase/generate-magic-link";
import {
  sendWelcomeEmail,
  sendUnsubscribedEmail,
  sendCancellationConfirmedEmail,
  sendGiftCardEmail,
} from "@/lib/emails";
import { sendRematchConfirmationEmail } from "@/lib/emails/rematch-confirmation";
import { sendMemberUpdateEmail } from "@/lib/emails/member-update";
import { sendPendingFollowupEmail } from "@/lib/emails/pending-followup";
import { sendPartnerWelcomeEmail } from "@/lib/emails/partner-welcome";
import { sendPerkLiveEmail } from "@/lib/emails/perk-live";
import { sendPerksAnnouncementEmail } from "@/lib/emails/perks-announcement";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DraftMember = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  // Full profile — for display and traffic light dots
  language: string[] | null;
  availability: { days: string[]; times: string[] } | null;
  topic_name: string | null;   // per-month choice from monthly_participation
  lat: number | null;
  lng: number | null;
  zipcode: string | null;
  children: { birth_month: number; birth_year: number; expected: boolean }[] | null;
  parent_type: "mom" | "dad" | "anyone" | null;
  match_priority: "age" | "proximity" | null;
  open_to_second_match: boolean;
};

/** Whether/when this pair was last matched, for the admin "recent match" confirmation row. */
export type RecentMatchInfo = {
  withinThreeMonths: boolean;
  lastMatchedOn: string | null;
};

export type DraftPair = {
  id: string;
  member1: DraftMember;
  member2: DraftMember;
  score: number;
  breakdown: {
    language: number;
    parent_type: number;
    availability: number;
    topic: number;
    proximity: number;
    children: number;
  };
  quality_tier: "great" | "good" | "needs_work";
  recentMatch: RecentMatchInfo;
};

export type RoundData = {
  id: string;
  month: string;
  status: "draft" | "committed" | "locked";
  round_score: number;
  pairs: DraftPair[];
  unmatched: DraftMember[];
  tierCounts: { great: number; good: number; needs_work: number };
  /** Member IDs that appear in more than one pair this round (second match) */
  doubleMatchedIds: string[];
  /** All members in the round — for reassignment dropdowns */
  allMembers: DraftMember[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function memberToCandidate(m: {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  zipcode: string | null;
  lat: number | null;
  lng: number | null;
  topic_id?: string | null;
  language: string[] | null;
  parent_type: string | null;
  availability: unknown;
  match_priority: string | null;
  children: unknown;
  open_to_second_match: boolean;
}): MatchCandidate {
  return {
    id: m.id,
    first_name: m.first_name,
    last_name: m.last_name,
    email: m.email,
    zipcode: m.zipcode,
    lat: m.lat,
    lng: m.lng,

    topic_id: m.topic_id ?? null,
    language: m.language as string[] | null,
    parent_type: m.parent_type as "mom" | "dad" | "anyone" | null,
    availability: m.availability as { days: string[]; times: string[] } | null,
    match_priority: m.match_priority as "age" | "proximity" | null,
    children: m.children as { birth_month: number; birth_year: number; expected: boolean }[] | null,
    open_to_second_match: m.open_to_second_match,
  };
}

/**
 * Fetch topic_ids from monthly_participation for a set of member IDs in a
 * given month. Returns a map of memberId → topic_id (or null if not found).
 */
async function fetchTopicIds(
  supabase: ReturnType<typeof createAdminClient>,
  memberIds: string[],
  monthStr: string
): Promise<Map<string, string | null>> {
  const monthDate = monthToDate(monthStr);
  const { data } = await supabase
    .from("monthly_participation")
    .select("member_id, topic_id")
    .in("member_id", memberIds)
    .eq("month", monthDate);

  const map = new Map<string, string | null>();
  for (const row of data ?? []) map.set(row.member_id, row.topic_id ?? null);
  return map;
}

/** Looks up a pair's last-matched info from a pairKey → date map (see getLastMatchedMap). */
function recentMatchInfo(
  lastMatchedMap: Map<string, string>,
  id1: string,
  id2: string
): RecentMatchInfo {
  const lastMatchedOn = lastMatchedMap.get([id1, id2].sort().join(":")) ?? null;
  if (!lastMatchedOn) return { withinThreeMonths: false, lastMatchedOn: null };

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  return {
    withinThreeMonths: new Date(lastMatchedOn) >= threeMonthsAgo,
    lastMatchedOn,
  };
}

// ---------------------------------------------------------------------------
// getRoundData
// ---------------------------------------------------------------------------

export async function getRoundData(month?: string): Promise<RoundData | null> {
  const supabase = createAdminClient();
  const monthStr = month ?? currentMonth();
  const monthDate = monthToDate(monthStr);

  // Load the round
  const { data: round, error: roundError } = await supabase
    .from("match_rounds")
    .select("id, status, round_score")
    .eq("month", monthDate)
    .maybeSingle();

  if (roundError || !round) return null;

  // Load all opted-in members for this month with full profiles + per-month topic
  const { data: participations } = await supabase
    .from("monthly_participation")
    .select(`
      member_id,
      topics ( name ),
      members (
        id, first_name, last_name, email,
        language, availability, lat, lng, zipcode, children,
        parent_type, match_priority, open_to_second_match
      )
    `)
    .eq("month", monthDate);

  // Build a rich member map keyed by id
  const memberMap = new Map<string, DraftMember>();
  for (const p of participations ?? []) {
    const m = p.members as unknown as {
      id: string; first_name: string; last_name: string; email: string;
      language: string[] | null; availability: unknown;
      lat: number | null; lng: number | null; zipcode: string | null;
      children: unknown; parent_type: string | null; match_priority: string | null; open_to_second_match: boolean;
    } | null;
    if (!m) continue;
    const topicName = (p.topics as unknown as { name: string } | null)?.name ?? null;
    memberMap.set(m.id, {
      id: m.id,
      first_name: m.first_name,
      last_name: m.last_name,
      email: m.email,
      language: m.language,
      availability: m.availability as { days: string[]; times: string[] } | null,
      topic_name: topicName,
      lat: m.lat,
      lng: m.lng,
      zipcode: m.zipcode,
      children: m.children as { birth_month: number; birth_year: number; expected: boolean }[] | null,
      parent_type: m.parent_type as "mom" | "dad" | "anyone" | null,
      match_priority: m.match_priority as "age" | "proximity" | null,
      open_to_second_match: m.open_to_second_match ?? false,
    });
  }

  // Load drafts
  const { data: drafts, error: draftsError } = await supabase
    .from("match_drafts")
    .select("id, score, breakdown, quality_tier, member_id_1, member_id_2")
    .eq("round_id", round.id);

  if (draftsError) return null;

  const lastMatchedMap = await getLastMatchedMap(supabase);

  // Count how many times each member appears (for double-match badge)
  const memberAppearances = new Map<string, number>();
  for (const d of drafts ?? []) {
    memberAppearances.set(d.member_id_1, (memberAppearances.get(d.member_id_1) ?? 0) + 1);
    memberAppearances.set(d.member_id_2, (memberAppearances.get(d.member_id_2) ?? 0) + 1);
  }
  const doubleMatchedIds = [...memberAppearances.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id);

  const pairs: DraftPair[] = (drafts ?? []).map((d) => ({
    id: d.id,
    member1: memberMap.get(d.member_id_1) ?? { id: d.member_id_1, first_name: "?", last_name: "", email: "", language: null, availability: null, topic_name: null, lat: null, lng: null, zipcode: null, children: null, parent_type: null, match_priority: null, open_to_second_match: false },
    member2: memberMap.get(d.member_id_2) ?? { id: d.member_id_2, first_name: "?", last_name: "", email: "", language: null, availability: null, topic_name: null, lat: null, lng: null, zipcode: null, children: null, parent_type: null, match_priority: null, open_to_second_match: false },
    score: Math.round(d.score),
    breakdown: d.breakdown as DraftPair["breakdown"],
    quality_tier: (d.quality_tier ?? "needs_work") as DraftPair["quality_tier"],
    recentMatch: recentMatchInfo(lastMatchedMap, d.member_id_1, d.member_id_2),
  }));

  const matchedIds = new Set(pairs.flatMap((p) => [p.member1.id, p.member2.id]));
  const unmatched = [...memberMap.values()].filter((m) => !matchedIds.has(m.id));

  const tierCounts = { great: 0, good: 0, needs_work: 0 };
  for (const p of pairs) tierCounts[p.quality_tier]++;

  const tierOrder = { needs_work: 0, good: 1, great: 2 };
  pairs.sort((a, b) => tierOrder[a.quality_tier] - tierOrder[b.quality_tier]);

  const allMembers = [...memberMap.values()];

  return {
    id: round.id,
    month: monthStr,
    status: round.status as RoundData["status"],
    round_score: Math.round(round.round_score ?? 0),
    pairs,
    unmatched,
    tierCounts,
    doubleMatchedIds,
    allMembers,
  };
}

// ---------------------------------------------------------------------------
// reassignDraftMember
// ---------------------------------------------------------------------------

/**
 * Delete a draft pair, returning both members to the unmatched pool.
 */
export async function deleteDraftPair(
  roundId: string,
  draftId: string,
  month?: string
): Promise<{ success: true; round: RoundData } | { success: false; error: string }> {
  const supabase = createAdminClient();

  const { data: round } = await supabase
    .from("match_rounds")
    .select("status")
    .eq("id", roundId)
    .single();

  if (!round || round.status === "locked") {
    return { success: false, error: "This round is locked and can no longer be edited." };
  }

  await supabase.from("match_drafts").delete().eq("id", draftId);

  const updated = await getRoundData(month);
  if (!updated) return { success: false, error: "Failed to reload round data." };
  return { success: true, round: updated };
}

/**
 * Replace one member of a draft pair with a different member.
 *
 * If newMemberId is currently in another draft, that draft is deleted
 * (making their former partner unmatched). The target draft is updated
 * with the new member and its score is recalculated.
 *
 * Returns updated round data on success, or an error string.
 */
export async function reassignDraftMember(
  roundId: string,
  draftId: string,
  slot: 1 | 2,
  newMemberId: string,
  month?: string
): Promise<{ success: true; round: RoundData } | { success: false; error: string }> {
  const supabase = createAdminClient();

  // Check round is still editable
  const { data: round } = await supabase
    .from("match_rounds")
    .select("status")
    .eq("id", roundId)
    .single();

  if (!round || round.status === "locked") {
    return { success: false, error: "This round is locked and can no longer be edited." };
  }

  // Load the target draft
  const { data: draft } = await supabase
    .from("match_drafts")
    .select("id, member_id_1, member_id_2")
    .eq("id", draftId)
    .single();

  if (!draft) return { success: false, error: "Draft not found." };

  // If newMemberId is already in another draft in this round, delete that draft
  const { data: conflictingDraft } = await supabase
    .from("match_drafts")
    .select("id")
    .eq("round_id", roundId)
    .neq("id", draftId)
    .or(`member_id_1.eq.${newMemberId},member_id_2.eq.${newMemberId}`)
    .maybeSingle();

  if (conflictingDraft) {
    await supabase.from("match_drafts").delete().eq("id", conflictingDraft.id);
  }

  // Determine the new member_id_1 and member_id_2
  const newMemberId1 = slot === 1 ? newMemberId : draft.member_id_1;
  const newMemberId2 = slot === 2 ? newMemberId : draft.member_id_2;

  // Fetch full profiles for score recalculation
  const { data: members } = await supabase
    .from("members")
    .select(
      "id, first_name, last_name, email, zipcode, lat, lng, language, parent_type, availability, match_priority, children, open_to_second_match"
    )
    .in("id", [newMemberId1, newMemberId2]);

  const m1 = members?.find((m) => m.id === newMemberId1);
  const m2 = members?.find((m) => m.id === newMemberId2);

  if (!m1 || !m2) return { success: false, error: "Could not load member profiles." };

  // Fetch per-month topic_ids for accurate scoring
  const topicIds = month
    ? await fetchTopicIds(supabase, [newMemberId1, newMemberId2], month)
    : new Map<string, string | null>();

  const candidate1 = memberToCandidate({ ...m1, topic_id: topicIds.get(m1.id) ?? null });
  const candidate2 = memberToCandidate({ ...m2, topic_id: topicIds.get(m2.id) ?? null });
  const coordMap = new Map<string, { lat: number; lng: number }>();
  if (m1.lat && m1.lng) coordMap.set(m1.id, { lat: m1.lat, lng: m1.lng });
  if (m2.lat && m2.lng) coordMap.set(m2.id, { lat: m2.lat, lng: m2.lng });

  const scored = scorePair(candidate1, candidate2, coordMap);
  const newTier = qualityTier(scored.score, maxAchievableScore(candidate1, candidate2, coordMap));

  // Update the draft
  await supabase
    .from("match_drafts")
    .update({
      member_id_1: newMemberId1,
      member_id_2: newMemberId2,
      score: scored.score,
      breakdown: scored.breakdown,
      quality_tier: newTier,
    })
    .eq("id", draftId);

  // Return fresh round data
  const updated = await getRoundData(month);
  if (!updated) return { success: false, error: "Failed to reload round data." };
  return { success: true, round: updated };
}

// ---------------------------------------------------------------------------
// createDraftPair — pair an unmatched member with another member
// ---------------------------------------------------------------------------

/**
 * Creates a new draft pair from two members.
 * If either member is already in another draft in this round, that draft is
 * deleted first (making their former partner unmatched).
 */
export async function createDraftPair(
  roundId: string,
  memberId1: string,
  memberId2: string,
  month?: string
): Promise<{ success: true; round: RoundData } | { success: false; error: string }> {
  const supabase = createAdminClient();

  const { data: round } = await supabase
    .from("match_rounds")
    .select("status")
    .eq("id", roundId)
    .single();

  if (!round || round.status === "locked") {
    return { success: false, error: "This round is locked and can no longer be edited." };
  }

  // Only remove memberId1 (the unmatched member being placed) from any existing draft.
  // memberId2 keeps their existing draft — this creates a second match for them
  // rather than pulling them out of their current pair.
  const { data: existing1 } = await supabase
    .from("match_drafts")
    .select("id")
    .eq("round_id", roundId)
    .or(`member_id_1.eq.${memberId1},member_id_2.eq.${memberId1}`)
    .maybeSingle();
  if (existing1) {
    await supabase.from("match_drafts").delete().eq("id", existing1.id);
  }

  // Fetch full profiles to score the pair
  const { data: members } = await supabase
    .from("members")
    .select("id, first_name, last_name, email, zipcode, lat, lng, language, parent_type, availability, match_priority, children, open_to_second_match")
    .in("id", [memberId1, memberId2]);

  const m1 = members?.find((m) => m.id === memberId1);
  const m2 = members?.find((m) => m.id === memberId2);
  if (!m1 || !m2) return { success: false, error: "Could not load member profiles." };

  // Fetch per-month topic_ids for accurate scoring
  const topicIds = month
    ? await fetchTopicIds(supabase, [memberId1, memberId2], month)
    : new Map<string, string | null>();

  const candidate1 = memberToCandidate({ ...m1, topic_id: topicIds.get(m1.id) ?? null });
  const candidate2 = memberToCandidate({ ...m2, topic_id: topicIds.get(m2.id) ?? null });
  const coordMap = new Map<string, { lat: number; lng: number }>();
  if (m1.lat && m1.lng) coordMap.set(m1.id, { lat: m1.lat, lng: m1.lng });
  if (m2.lat && m2.lng) coordMap.set(m2.id, { lat: m2.lat, lng: m2.lng });

  const scored = scorePair(candidate1, candidate2, coordMap);
  const quality_tier = qualityTier(scored.score, maxAchievableScore(candidate1, candidate2, coordMap));

  await supabase.from("match_drafts").insert({
    round_id: roundId,
    member_id_1: memberId1,
    member_id_2: memberId2,
    score: scored.score,
    breakdown: scored.breakdown,
    quality_tier,
  });

  const updated = await getRoundData(month);
  if (!updated) return { success: false, error: "Failed to reload round data." };
  return { success: true, round: updated };
}

// ---------------------------------------------------------------------------
// computeCandidateScores — score an orphan member against all other members
// ---------------------------------------------------------------------------

export type CandidateScore = {
  member: DraftMember;
  score: number;
  breakdown: DraftPair["breakdown"];
  isAlreadyMatched: boolean;
  recentMatch: RecentMatchInfo;
};

export async function computeCandidateScores(
  roundId: string,
  orphanId: string
): Promise<CandidateScore[]> {
  const supabase = createAdminClient();

  // Fetch full profiles for all members in this round
  const { data: round } = await supabase
    .from("match_rounds")
    .select("month")
    .eq("id", roundId)
    .single();
  if (!round) return [];

  const { data: participations } = await supabase
    .from("monthly_participation")
    .select(`
      member_id,
      topics ( name ),
      members (
        id, first_name, last_name, email,
        language, availability, lat, lng, zipcode, children,
        parent_type, match_priority, open_to_second_match
      )
    `)
    .eq("month", round.month);

  const members: DraftMember[] = (participations ?? [])
    .map((p) => {
      const m = p.members as unknown as {
        id: string; first_name: string; last_name: string; email: string;
        language: string[] | null; availability: unknown;
        lat: number | null; lng: number | null; zipcode: string | null;
        children: unknown; parent_type: string | null; match_priority: string | null;
        open_to_second_match: boolean;
      } | null;
      if (!m) return null;
      return {
        id: m.id, first_name: m.first_name, last_name: m.last_name, email: m.email,
        language: m.language,
        availability: m.availability as { days: string[]; times: string[] } | null,
        topic_name: (p.topics as unknown as { name: string } | null)?.name ?? null,
        lat: m.lat, lng: m.lng, zipcode: m.zipcode,
        children: m.children as { birth_month: number; birth_year: number; expected: boolean }[] | null,
        parent_type: m.parent_type as "mom" | "dad" | "anyone" | null,
        match_priority: m.match_priority as "age" | "proximity" | null,
        open_to_second_match: m.open_to_second_match ?? false,
      } as DraftMember;
    })
    .filter((m): m is DraftMember => m !== null);

  const orphan = members.find((m) => m.id === orphanId);
  if (!orphan) return [];

  // Find already-matched member IDs
  const { data: drafts } = await supabase
    .from("match_drafts")
    .select("member_id_1, member_id_2")
    .eq("round_id", roundId);
  const matchedIds = new Set((drafts ?? []).flatMap((d) => [d.member_id_1, d.member_id_2]));

  const lastMatchedMap = await getLastMatchedMap(supabase);

  // Build coord map
  const coordMap = new Map<string, { lat: number; lng: number }>();
  for (const m of members) {
    if (m.lat && m.lng) coordMap.set(m.id, { lat: m.lat, lng: m.lng });
  }

  // Score orphan against each candidate
  const orphanCandidate = memberToCandidate({
    ...orphan, zipcode: orphan.zipcode, lat: orphan.lat, lng: orphan.lng,
    topic_id: null, // topic scored separately below
  } as Parameters<typeof memberToCandidate>[0]);

  return members
    .filter((m) => m.id !== orphanId)
    .map((candidate) => {
      const c = memberToCandidate({
        ...candidate, zipcode: candidate.zipcode, lat: candidate.lat, lng: candidate.lng,
        topic_id: null,
      } as Parameters<typeof memberToCandidate>[0]);

      // Add topic_id from topic_name for scoring
      const topicId = (name: string | null) => name ?? null;
      const scored = scorePair(
        { ...orphanCandidate, topic_id: topicId(orphan.topic_name) },
        { ...c, topic_id: topicId(candidate.topic_name) },
        coordMap
      );
      return {
        member: candidate,
        score: Math.round(scored.score),
        breakdown: scored.breakdown,
        isAlreadyMatched: matchedIds.has(candidate.id),
        recentMatch: recentMatchInfo(lastMatchedMap, orphanId, candidate.id),
      };
    })
    // Not-yet-matched candidates first (highest → lowest score), then
    // candidates who'd become a second match (highest → lowest score).
    .sort((a, b) => {
      if (a.isAlreadyMatched !== b.isAlreadyMatched) {
        return a.isAlreadyMatched ? 1 : -1;
      }
      return b.score - a.score;
    });
}

// ---------------------------------------------------------------------------
// testResetRound — clear this month's test data so the flow can be re-run
// ---------------------------------------------------------------------------

export async function testResetRound(): Promise<TestStepResult> {
  const supabase = createAdminClient();
  const monthDate = monthToDate(currentMonth());

  // Find and delete the match_round (cascades to match_drafts)
  const { data: round } = await supabase
    .from("match_rounds")
    .select("id")
    .eq("month", monthDate)
    .maybeSingle();

  if (round) {
    await supabase.from("match_rounds").delete().eq("id", round.id);
  }

  // Delete matches for this month
  await supabase.from("matches").delete().eq("matched_on", monthDate);

  // Clear monthly_participation for this month
  await supabase.from("monthly_participation").delete().eq("month", monthDate);

  // Clear monthly_skips for this month
  await supabase.from("monthly_skips").delete().eq("month", monthDate);

  // Keep Alex's test account at exactly two fixed past matches. Local only —
  // these test controls aren't gated, and this must never write to prod.
  let fixtureNote = "";
  if (process.env.NODE_ENV !== "production") {
    fixtureNote = ` ${await ensureAlexPastMatches(supabase)}`;
  }

  return { success: true, message: `Test data cleared for ${currentMonth()}. Ready to re-run.${fixtureNote}` };
}

// ---------------------------------------------------------------------------
// Test mode triggers
// Calls each API endpoint server-side with testMode: true so MATCHER_API_SECRET
// is never exposed to the browser.
// ---------------------------------------------------------------------------

/** `link`: an optional URL the test controls show as a clickable link. */
type TestStepResult = { success: true; message: string; link?: string } | { success: false; error: string };

async function callEndpoint(path: string, body: Record<string, unknown>): Promise<TestStepResult> {
  const secret = process.env.MATCHER_API_SECRET;
  if (!secret) return { success: false, error: "MATCHER_API_SECRET is not set." };

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const url = `${protocol}://${host}${path}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { success: false, error: data?.error ?? `HTTP ${res.status}` };
  }
  return { success: true, message: JSON.stringify(data) };
}

/**
 * Test opt-in simulation — no emails. Writes monthly_participation /
 * monthly_skips rows directly:
 * - the test member (TEST_EMAIL, default Alex's account) always opts into
 *   coffee, so there's always a coffee match to look at;
 * - everyone else gets a random coffee | playdate | skip | no-response, with
 *   at least one other coffee and one playdate so the test member always has
 *   someone to match with and both topics show up in the round.
 * Skips never call Stripe (test subscriptions aren't real). Refuses to run in
 * production: these controls write to whatever database the app points at.
 */
export async function testSimulateOptins(): Promise<TestStepResult> {
  if (process.env.NODE_ENV === "production") {
    return { success: false, error: "Test controls are disabled in production." };
  }
  return simulateOptins();
}

async function simulateOptins(): Promise<TestStepResult> {
  const supabase = createAdminClient();
  const monthDate = monthToDate(currentMonth());

  // All active members (includes "canceling" — paid through end of period)
  const { data: members, error } = await supabase
    .from("members")
    .select("id, first_name, email")
    .in("status", ["active", "canceling"]);
  if (error || !members?.length) {
    return { success: false, error: error?.message ?? "No active members in test DB." };
  }

  const { data: topics } = await supabase.from("topics").select("id, name");
  const coffeeId = topics?.find((t) => t.name === "coffee")?.id;
  const playdateId = topics?.find((t) => t.name === "playdate")?.id;
  if (!coffeeId || !playdateId) return { success: false, error: "coffee/playdate topics missing." };

  const testEmail = process.env.TEST_EMAIL ?? ALEX_TEST_EMAIL;
  const testMember = members.find((m) => m.email === testEmail);
  const summary: string[] = [];

  if (testMember) {
    await optInTestMemberToCoffee(testMember.id, coffeeId);
    summary.push(`${testMember.first_name}: coffee`);
  } else {
    summary.push(`No active member for ${testEmail}`);
  }

  const rest = members.filter((m) => m.id !== testMember?.id);
  const allActions = ["coffee", "playdate", "skip", "no_response"] as const;
  const guaranteed: Array<(typeof allActions)[number]> = ["coffee", "playdate"];
  for (const member of [...rest].sort(() => Math.random() - 0.5)) {
    const action = guaranteed.length > 0
      ? guaranteed.splice(Math.floor(Math.random() * guaranteed.length), 1)[0]
      : allActions[Math.floor(Math.random() * allActions.length)];

    if (action === "coffee" || action === "playdate") {
      await supabase.from("monthly_participation").upsert(
        { member_id: member.id, month: monthDate, topic_id: action === "coffee" ? coffeeId : playdateId },
        { onConflict: "member_id,month" }
      );
    } else if (action === "skip") {
      await supabase.from("monthly_skips").upsert(
        { member_id: member.id, month: monthDate },
        { onConflict: "member_id,month" }
      );
    }
    summary.push(`${member.first_name}: ${action.replace("_", " ")}`);
  }

  return { success: true, message: summary.join(" · ") };
}

/** Test member → coffee this month, clearing any skip. */
async function optInTestMemberToCoffee(memberId: string, coffeeId: string): Promise<void> {
  const supabase = createAdminClient();
  const monthDate = monthToDate(currentMonth());
  await supabase.from("monthly_skips").delete().eq("member_id", memberId).eq("month", monthDate);
  await supabase.from("monthly_participation").upsert(
    { member_id: memberId, month: monthDate, topic_id: coffeeId },
    { onConflict: "member_id,month" }
  );
}

export async function testRunMatcher(): Promise<TestStepResult> {
  // Local only: make the round self-sufficient so "Reset → Run matcher"
  // always ends with the test member (Alex) in a coffee match. If nobody
  // has opted in yet (the simulate step was skipped), simulate first;
  // either way, the test member is opted into coffee.
  const notes: string[] = [];
  if (process.env.NODE_ENV !== "production") {
    const prep = await prepareTestRound();
    if (prep) notes.push(prep);
  }

  const result = await callEndpoint("/api/run-matcher", { testMode: true, dryRun: false });
  if (!result.success) return result;

  // Alex's test account must always come out of a test round with a match,
  // so /matches has a current match to test against. Local only.
  if (process.env.NODE_ENV !== "production") {
    const note = await ensureTestMemberMatched();
    if (note) notes.push(note);
  }
  return { success: true, message: [...notes, result.message].join(" · ") };
}

/** Before the matcher: simulate opt-ins if there are none, and put the test member in coffee. */
async function prepareTestRound(): Promise<string | null> {
  const supabase = createAdminClient();
  const monthDate = monthToDate(currentMonth());

  const { count } = await supabase
    .from("monthly_participation")
    .select("id", { count: "exact", head: true })
    .eq("month", monthDate);
  if ((count ?? 0) < 2) {
    const simulated = await simulateOptins();
    return simulated.success ? "Simulated opt-ins" : simulated.error;
  }

  const testEmail = process.env.TEST_EMAIL ?? ALEX_TEST_EMAIL;
  const [{ data: testMember }, { data: coffee }] = await Promise.all([
    supabase.from("members").select("id").eq("email", testEmail).maybeSingle(),
    supabase.from("topics").select("id").eq("name", "coffee").maybeSingle(),
  ]);
  if (testMember && coffee) await optInTestMemberToCoffee(testMember.id as string, coffee.id as string);
  return null;
}

/**
 * If the test member (TEST_EMAIL, default Alex's account) opted in this month
 * but the matcher left them unmatched, adds a draft pair for them with the
 * best-scoring partner — preferring someone not already matched this round
 * and not matched with them in the last three months. Creates the draft
 * round if the matcher didn't (it only does when it matched at least one
 * pair). Returns a short note for the test-controls output, or null if
 * nothing needed doing.
 */
async function ensureTestMemberMatched(): Promise<string | null> {
  const supabase = createAdminClient();
  const monthDate = monthToDate(currentMonth());
  const testEmail = process.env.TEST_EMAIL ?? ALEX_TEST_EMAIL;

  const { data: testMember } = await supabase
    .from("members")
    .select("id, first_name")
    .eq("email", testEmail)
    .maybeSingle();
  if (!testMember) return `No member found for ${testEmail}`;

  const { data: participation } = await supabase
    .from("monthly_participation")
    .select("id")
    .eq("member_id", testMember.id)
    .eq("month", monthDate)
    .maybeSingle();
  if (!participation) return `${testMember.first_name} didn't opt in this month`;

  let { data: round } = await supabase
    .from("match_rounds")
    .select("id")
    .eq("month", monthDate)
    .maybeSingle();

  if (round) {
    const { data: existing } = await supabase
      .from("match_drafts")
      .select("id")
      .eq("round_id", round.id)
      .or(`member_id_1.eq.${testMember.id},member_id_2.eq.${testMember.id}`)
      .limit(1);
    if (existing?.length) return null; // already matched
  } else {
    const { data: created, error } = await supabase
      .from("match_rounds")
      .insert({ month: monthDate, status: "draft", round_score: 0 })
      .select("id")
      .single();
    if (error || !created) return `Couldn't create a round for ${testMember.first_name}: ${error?.message}`;
    round = created;
  }

  const candidates = await computeCandidateScores(round.id, testMember.id);
  const partner =
    candidates.find((c) => !c.isAlreadyMatched && !c.recentMatch.withinThreeMonths) ??
    candidates.find((c) => !c.recentMatch.withinThreeMonths) ??
    candidates[0];
  if (!partner) return `No one else opted in — couldn't match ${testMember.first_name}`;

  const created = await createDraftPair(round.id, testMember.id, partner.member.id, currentMonth());
  if (!created.success) return `Couldn't match ${testMember.first_name}: ${created.error}`;
  return `${testMember.first_name} was unmatched — paired with ${partner.member.first_name}`;
}

export async function testCommitMatches(): Promise<TestStepResult> {
  return callEndpoint("/api/commit-matches", { testMode: true });
}

/**
 * Stand-in for "Send match emails": sends nothing, and returns the test
 * member's (Alex's) match page link for this month — the same signed URL
 * the real email would contain (see app/api/send-match-emails). The real
 * send route only reads, so skipping it changes no round state; Lock round
 * still works afterwards. Local only.
 */
export async function testSimulateMatchEmails(): Promise<TestStepResult> {
  if (process.env.NODE_ENV === "production") {
    return { success: false, error: "Test controls are disabled in production." };
  }
  const supabase = createAdminClient();
  const monthDate = monthToDate(currentMonth());
  const testEmail = process.env.TEST_EMAIL ?? ALEX_TEST_EMAIL;

  const { data: testMember } = await supabase
    .from("members")
    .select("id, first_name")
    .eq("email", testEmail)
    .maybeSingle();
  if (!testMember) return { success: false, error: `No member found for ${testEmail}` };

  const { data: match } = await supabase
    .from("matches")
    .select("id, member_id_1, member_id_2")
    .eq("matched_on", monthDate)
    .or(`member_id_1.eq.${testMember.id},member_id_2.eq.${testMember.id}`)
    .limit(1)
    .maybeSingle();
  if (!match) {
    return { success: false, error: `No committed match for ${testMember.first_name} yet — run Commit matches first` };
  }

  const otherId = match.member_id_1 === testMember.id ? match.member_id_2 : match.member_id_1;
  const { data: other } = await supabase.from("members").select("first_name").eq("id", otherId).maybeSingle();

  return {
    success: true,
    message: `${testMember.first_name} & ${other?.first_name ?? "their match"} — no emails sent`,
    link: `/matches/${match.id}?token=${generateMatchToken(match.id as string)}`,
  };
}

export async function testLockRound(): Promise<TestStepResult> {
  return callEndpoint("/api/lock-matches", { testMode: true });
}

// ---------------------------------------------------------------------------
// testSendOptinEmail — send the real monthly opt-in email to the test member
// ---------------------------------------------------------------------------

/**
 * Sends the actual opt-in email (real signed links) to the test member only —
 * POST /api/send-optin-email in testMode, which filters to TEST_EMAIL's
 * member. Unlike the round controls above, this one is meant to work in
 * production too: it's how to check the email and its buttons end to end
 * before the real send. Clicking the buttons records real opt-ins for that
 * member (and, once the round has committed, "just perks" debits a match),
 * so undo those in the DB afterward if the account is a real one.
 */
async function sendOptinTest(): Promise<TestStepResult> {
  const testEmail = process.env.TEST_EMAIL ?? "amsterdamparentproject@gmail.com";
  const result = await callEndpoint("/api/send-optin-email", { testMode: true });
  if (!result.success) return result;

  let sent = 0;
  let failed = 0;
  try {
    const data = JSON.parse(result.message);
    sent = data.sent ?? 0;
    failed = data.failed ?? 0;
  } catch {
    // fall through to the generic error below
  }
  if (failed > 0) return { success: false, error: `Send to ${testEmail} failed — see server logs` };
  if (sent === 0) {
    return { success: false, error: `No active or canceling member with email ${testEmail} — nothing sent` };
  }
  return { success: true, message: `Sent the opt-in email to ${testEmail}` };
}

// ---------------------------------------------------------------------------
// testSendEmail — send any transactional email to the test member
// ---------------------------------------------------------------------------

export type TestEmailKind =
  | "optin"
  | "match-reveal"
  | "meetup-reminder"
  | "welcome"
  | "cancellation-confirmed"
  | "unsubscribed"
  | "rematch-confirmation"
  | "gift-card"
  | "member-update"
  | "pending-followup"
  | "partner-welcome"
  | "perk-live"
  | "perks-announcement";

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://postpartumpost.com";

/** Parses the JSON body callEndpoint hands back as `message`. */
function parseCounts(message: string): { sent: number; failed: number; details?: unknown } {
  try {
    const data = JSON.parse(message);
    return { sent: data.sent ?? data.sentCount ?? 0, failed: data.failed ?? 0, details: data.details ?? data.errors };
  } catch {
    return { sent: 0, failed: 0 };
  }
}

/**
 * Sends one transactional email to the test member (TEST_EMAIL, default
 * amsterdamparentproject@gmail.com) with real links — signed opt-in tokens,
 * magic links, the real match page — built the same way the production
 * senders build them. The routes that already have a test mode (opt-in,
 * match reveal, meetup reminder) are called as-is; the rest call their
 * sender directly with the test member's details. Works in production,
 * since it only ever emails the test member, but clicking a link acts on
 * that member's real record.
 */
export async function testSendEmail(kind: TestEmailKind): Promise<TestStepResult> {
  const testEmail = process.env.TEST_EMAIL ?? "amsterdamparentproject@gmail.com";
  const supabase = createAdminClient();

  const { data: member } = await supabase
    .from("members")
    .select("id, first_name, last_name")
    .eq("email", testEmail)
    .maybeSingle();
  // Partner-only emails don't need a member; everything else does.
  if (!member && kind !== "partner-welcome" && kind !== "perk-live") {
    return { success: false, error: `No member with email ${testEmail} — nothing sent` };
  }
  const firstName = (member?.first_name as string | undefined) ?? "there";
  const lastName = (member?.last_name as string | undefined) ?? "";
  const memberId = member?.id as string | undefined;
  const ok = (what: string): TestStepResult => ({ success: true, message: `Sent ${what} to ${testEmail}` });

  try {
    switch (kind) {
      case "optin":
        return await sendOptinTest();

      case "match-reveal": {
        const res = await callEndpoint("/api/send-match-emails", { testMode: true });
        if (!res.success) return res;
        const { sent, failed } = parseCounts(res.message);
        if (failed > 0) return { success: false, error: "Send failed — see server logs" };
        if (sent === 0) {
          return { success: false, error: `No committed match this month for ${testEmail} — run Commit matches first` };
        }
        return ok("the match reveal email");
      }

      case "meetup-reminder": {
        const res = await callEndpoint("/api/send-meetup-reminder", { dryRun: true });
        if (!res.success) return res;
        const { sent, failed } = parseCounts(res.message);
        if (failed > 0) return { success: false, error: "Send failed — see server logs" };
        if (sent === 0) {
          return { success: false, error: `Nothing sent — ${testEmail} needs an eligible match this month` };
        }
        return ok("the meetup reminder");
      }

      case "welcome": {
        const link = await generateMagicLinkWithRetry(supabase, testEmail, `${SITE_URL}/profile`);
        const nextBilling = new Date(Date.now() + 30 * 86_400_000).toLocaleDateString("en-NL", {
          day: "numeric", month: "long", year: "numeric",
        });
        await sendWelcomeEmail(
          testEmail, firstName, link.success ? link.url : `${SITE_URL}/profile`, "Monthly (€12/mo)", nextBilling,
        );
        return ok("the welcome email");
      }

      case "cancellation-confirmed":
        await sendCancellationConfirmedEmail(testEmail, firstName, 2);
        return ok("the cancellation confirmation");


      case "unsubscribed":
        await sendUnsubscribedEmail(supabase, testEmail, firstName, memberId!);
        return ok("the unsubscribed email");

      case "rematch-confirmation":
        await sendRematchConfirmationEmail(testEmail, firstName);
        return ok("the report confirmation");

      case "gift-card":
        // A placeholder code: the link opens the real /redeem page, but the
        // code isn't a valid gift card, so redeeming it won't go through.
        await sendGiftCardEmail(testEmail, "TESTCODE", 3);
        return ok("the gift card email (placeholder code)");

      case "member-update":
        await sendMemberUpdateEmail(testEmail, firstName, memberId!);
        return ok("the member update email");

      case "pending-followup":
        await sendPendingFollowupEmail(testEmail, firstName, lastName);
        return ok("the pending follow-up email");

      case "partner-welcome": {
        const link = await generateMagicLinkWithRetry(supabase, testEmail, `${SITE_URL}/partners/profile`);
        await sendPartnerWelcomeEmail({
          firstName,
          businessName: "Test Business",
          email: testEmail,
          portalUrl: link.success ? link.url : `${SITE_URL}/partners/login`,
        });
        return ok("the partner welcome email");
      }

      case "perks-announcement":
        // Test member only. The send to all members is the
        // perks-announcement:prod script, never this button.
        await sendPerksAnnouncementEmail(testEmail, firstName);
        return ok("the Post Perks announcement");

      case "perk-live":
        await sendPerkLiveEmail({ firstName, businessName: "Test Business", email: testEmail, perkTitle: "Test perk" });
        return ok("the perk-live email");
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
