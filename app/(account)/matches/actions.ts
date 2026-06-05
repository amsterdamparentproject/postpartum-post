"use server";

import { createAdminClient } from "@/lib/supabase";
import { currentMonth, monthToDate } from "@/lib/skip-token";

export type MatchStatus =
  | { type: "pending"; topic: "coffee" | "playdate" }
  | { type: "matched"; matchId: string; topic: "coffee" | "playdate"; matchFirstName: string }
  | { type: "none" };

/**
 * Returns the current month's match status for a member:
 *  - pending: opted in but not yet matched
 *  - matched: has a committed match this month
 *  - none: did not opt in this month
 */
export async function getMatchStatus(memberId: string): Promise<MatchStatus> {
  const supabase = createAdminClient();
  const monthDate = monthToDate(currentMonth());

  // Check for an existing match this month
  const { data: match } = await supabase
    .from("matches")
    .select(`
      id,
      match_type,
      member_id_1,
      member_id_2,
      member1:member_id_1 ( first_name ),
      member2:member_id_2 ( first_name )
    `)
    .or(`member_id_1.eq.${memberId},member_id_2.eq.${memberId}`)
    .gte("matched_on", monthDate)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (match) {
    const isM1 = match.member_id_1 === memberId;
    const partnerRaw = isM1 ? match.member2 : match.member1;
    const partnerData = Array.isArray(partnerRaw) ? partnerRaw[0] : partnerRaw;

    return {
      type: "matched",
      matchId: match.id,
      topic: (match.match_type ?? "coffee") as "coffee" | "playdate",
      matchFirstName: (partnerData as { first_name: string } | null)?.first_name ?? "",
    };
  }

  // Check for opt-in participation this month
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
    };
  }

  return { type: "none" };
}
