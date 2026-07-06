"use server";

import { createAdminClient } from "@/lib/supabase";
import { headers } from "next/headers";
import { sendOptinEmail } from "@/lib/emails";
import { generateOptinToken } from "@/lib/optin-token";
import { currentMonth, monthToDate } from "@/lib/tokens";
import { scorePair, parentTypeCompatible, maxAchievableScore, qualityTier, type MatchCandidate } from "@/lib/matcher";

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

  const newScore = Math.round(scored.score);
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
  const score = Math.round(scored.score);
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
      };
    })
    .sort((a, b) => b.score - a.score);
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

  return { success: true, message: `Test data cleared for ${currentMonth()}. Ready to re-run.` };
}

// ---------------------------------------------------------------------------
// Test mode triggers
// Calls each API endpoint server-side with testMode: true so MATCHER_API_SECRET
// is never exposed to the browser.
// ---------------------------------------------------------------------------

type TestStepResult = { success: true; message: string } | { success: false; error: string };

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
 * Test opt-in simulation:
 * - Sends a real opt-in email to the first test member so you can see it fire.
 * - Randomly assigns coffee | playdate | skip | no-response to the rest,
 *   guaranteeing all four outcomes are represented in the round.
 * - Writes monthly_participation / monthly_skips rows directly to the test DB.
 *   Skip does NOT call Stripe (test subscriptions aren't real).
 */
export async function testSendOptinEmail(): Promise<TestStepResult> {
  const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://postpartumpost.com";
  const supabase = createAdminClient();
  const month = currentMonth();
  const monthDate = monthToDate(month);

  // Fetch all active members from the test DB (includes "canceling" — paid through end of period)
  const { data: members, error } = await supabase
    .from("members")
    .select("id, first_name, email")
    .in("status", ["active", "canceling"]);

  if (error || !members?.length) {
    return { success: false, error: error?.message ?? "No active members in test DB." };
  }

  const buildOptinUrl = (memberId: string, action: "coffee" | "playdate" | "skip") => {
    const token = generateOptinToken(memberId, month, action);
    return `${SITE_URL}/api/optin?member=${memberId}&month=${month}&action=${action}&token=${token}`;
  };

  // --- Step 1: Send a real email to the test member ---
  const TEST_EMAIL = process.env.TEST_EMAIL ?? "amsterdamparentproject@gmail.com";
  const testMember = members.find(m => m.email === TEST_EMAIL) ?? members[0];
  try {
    await sendOptinEmail(
      testMember.email,
      testMember.first_name,
      buildOptinUrl(testMember.id, "coffee"),
      buildOptinUrl(testMember.id, "playdate"),
      buildOptinUrl(testMember.id, "skip")
    );
  } catch (err) {
    return { success: false, error: `Failed to send email to ${testMember.email}: ${err}` };
  }

  // Fetch topic IDs once
  const { data: topics } = await supabase.from("topics").select("id, name");
  const coffeeId = topics?.find((t) => t.name === "coffee")?.id;
  const playdateId = topics?.find((t) => t.name === "playdate")?.id;

  // --- Step 2: Opt testMember into coffee so they're always matchable ---
  if (coffeeId) {
    await supabase.from("monthly_participation").upsert(
      { member_id: testMember.id, month: monthDate, topic_id: coffeeId },
      { onConflict: "member_id,month" }
    );
  }

  // --- Step 3: Simulate responses for remaining members ---
  // Guarantee coffee + playdate appear at least once (skip/no_response are
  // optional extras) so the pool always has enough participants to match.
  const rest = members.filter(m => m.id !== testMember.id);
  const allActions: Array<"coffee" | "playdate" | "skip" | "no_response"> =
    ["coffee", "playdate", "skip", "no_response"];
  const shuffled = [...rest].sort(() => Math.random() - 0.5);
  const assignments: Array<{ member: typeof testMember; action: typeof allActions[number] }> = [];

  const guaranteed: typeof allActions = ["coffee", "playdate"];
  for (const m of shuffled) {
    const action = guaranteed.length > 0
      ? guaranteed.splice(Math.floor(Math.random() * guaranteed.length), 1)[0]
      : allActions[Math.floor(Math.random() * allActions.length)];
    assignments.push({ member: m, action });
  }

  const summary: string[] = [`Sent email to ${testMember.email} (opted in: coffee)`];

  for (const { member, action } of assignments) {
    if (action === "coffee" && coffeeId) {
      await supabase.from("monthly_participation").upsert(
        { member_id: member.id, month: monthDate, topic_id: coffeeId },
        { onConflict: "member_id,month" }
      );
      summary.push(`${member.first_name}: coffee`);
    } else if (action === "playdate" && playdateId) {
      await supabase.from("monthly_participation").upsert(
        { member_id: member.id, month: monthDate, topic_id: playdateId },
        { onConflict: "member_id,month" }
      );
      summary.push(`${member.first_name}: playdate`);
    } else if (action === "skip") {
      await supabase.from("monthly_skips").upsert(
        { member_id: member.id, month: monthDate },
        { onConflict: "member_id,month" }
      );
      // No Stripe call in test mode
      summary.push(`${member.first_name}: skip`);
    } else {
      summary.push(`${member.first_name}: no response`);
    }
  }

  return { success: true, message: summary.join(" · ") };
}

export async function testRunMatcher(): Promise<TestStepResult> {
  return callEndpoint("/api/run-matcher", { testMode: true, dryRun: false });
}

export async function testCommitMatches(): Promise<TestStepResult> {
  return callEndpoint("/api/commit-matches", { testMode: true });
}

export async function testSendMatchEmails(): Promise<TestStepResult> {
  return callEndpoint("/api/send-match-emails", { testMode: true });
}

export async function testLockRound(): Promise<TestStepResult> {
  return callEndpoint("/api/lock-matches", { testMode: true });
}
