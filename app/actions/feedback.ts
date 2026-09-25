"use server";

import { createAdminClient } from "@/lib/supabase";
import { requireMember } from "@/lib/require-member";

// ---------------------------------------------------------------------------
// Feedback context — used to label the form with the member's most recent
// match month ("July match", or "July matches" if double-matched that
// round) and to tag the submitted feedback row with match_ids when possible.
// Falls back to an empty list when the member has never been matched;
// feedback is still accepted in that case.
// ---------------------------------------------------------------------------

export type FeedbackContext = {
  matchIds: string[];
  /** e.g. "July match" or "July matches" — null when the member has no match history. */
  monthLabel: string | null;
};

export async function getFeedbackContext(accessToken: string, matchId?: string): Promise<FeedbackContext> {
  const authed = await requireMember(accessToken);
  if (!authed) return { matchIds: [], monthLabel: null };
  const memberId = authed.memberId;
  const supabase = createAdminClient();

  // Opened from a specific match card (/feedback?match=<id>) — scope the
  // feedback to that one match if it's really theirs. Otherwise fall
  // through to the most-recent-month default below.
  if (matchId) {
    const { data: match } = await supabase
      .from("matches")
      .select(`
        id,
        matched_on,
        member_id_1,
        member_id_2,
        member1:member_id_1 ( first_name ),
        member2:member_id_2 ( first_name )
      `)
      .eq("id", matchId)
      .maybeSingle();

    if (match && (match.member_id_1 === memberId || match.member_id_2 === memberId)) {
      const partnerRaw = match.member_id_1 === memberId ? match.member2 : match.member1;
      const partner = (Array.isArray(partnerRaw) ? partnerRaw[0] : partnerRaw) as { first_name: string } | null;
      const monthName = new Date(`${match.matched_on}T00:00:00`).toLocaleString("en-US", { month: "long" });
      return {
        matchIds: [match.id],
        monthLabel: partner?.first_name ? `${monthName} match with ${partner.first_name}` : `${monthName} match`,
      };
    }
  }

  const { data } = await supabase
    .from("matches")
    .select("id, matched_on")
    .or(`member_id_1.eq.${memberId},member_id_2.eq.${memberId}`)
    .eq("flagged_for_review", false)
    .order("matched_on", { ascending: false });

  if (!data?.length) return { matchIds: [], monthLabel: null };

  // A double-matched member has two rows sharing the same matched_on date
  // for that round — group by the most recent date to catch both.
  const mostRecentDate = data[0].matched_on;
  const matchIds = data.filter((m) => m.matched_on === mostRecentDate).map((m) => m.id);

  const monthName = new Date(`${mostRecentDate}T00:00:00`).toLocaleString("en-US", { month: "long" });
  const monthLabel = `${monthName} ${matchIds.length > 1 ? "matches" : "match"}`;

  return { matchIds, monthLabel };
}

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

export type SubmitFeedbackInput = {
  happyWithMatch: number;
  matchingProcessRating: number;
  matchPageHelpful: number;
  activitiesRelevant: number;
  activitiesFeedback?: string;
  generalFeedback?: string;
  willingToFollowUp?: boolean;
};

function inRange(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 5;
}

export async function submitMatchFeedback(
  accessToken: string,
  matchIds: string[],
  input: SubmitFeedbackInput,
): Promise<{ success: boolean }> {
  const authed = await requireMember(accessToken);
  if (!authed) throw new Error("Not signed in");
  const memberId = authed.memberId;

  if (
    !inRange(input.happyWithMatch) ||
    !inRange(input.matchingProcessRating) ||
    !inRange(input.matchPageHelpful) ||
    !inRange(input.activitiesRelevant)
  ) {
    throw new Error("Ratings must be between 1 and 5.");
  }

  const supabase = createAdminClient();

  const { error } = await supabase.from("match_feedback").insert({
    member_id: memberId,
    match_ids: matchIds.length ? matchIds : null,
    happy_with_match: input.happyWithMatch,
    matching_process_rating: input.matchingProcessRating,
    match_page_helpful: input.matchPageHelpful,
    activities_relevant: input.activitiesRelevant,
    activities_feedback: input.activitiesFeedback ?? null,
    general_feedback: input.generalFeedback ?? null,
    willing_to_follow_up: input.willingToFollowUp ?? false,
  });

  if (error) {
    console.error("[submitMatchFeedback] insert error:", error);
    throw new Error("Failed to save feedback.");
  }

  return { success: true };
}
