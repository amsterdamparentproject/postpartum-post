"use server";

import { createAdminClient } from "@/lib/supabase";
import { currentMonth, monthToDate } from "@/lib/skip-token";
import { generateMatchToken } from "@/lib/match-token";

export type MatchEntry = {
  matchId: string;
  token: string;
  topic: "coffee" | "playdate";
  matchFirstName: string;
  matchedOn: string;
  active: boolean;
};

export type MatchStatus =
  | { type: "pending"; topic: "coffee" | "playdate"; pastMatches: MatchEntry[] }
  | { type: "matched"; matches: MatchEntry[]; pastMatches: MatchEntry[] }
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
      member_id_1,
      member_id_2,
      member1:member_id_1 ( first_name ),
      member2:member_id_2 ( first_name )
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
    return {
      matchId: match.id,
      token: generateMatchToken(match.id),
      topic: (topicByMonth.get(match.matched_on) ?? "coffee") as "coffee" | "playdate",
      matchFirstName: (partnerData as { first_name: string } | null)?.first_name ?? "",
      matchedOn: match.matched_on,
      active: isCurrentMonth && !match.rematch_requested,
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

  return { type: "none", pastMatches };
}
