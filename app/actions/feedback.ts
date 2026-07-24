"use server";

import { createAdminClient } from "@/lib/supabase";

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

export async function getFeedbackContext(memberId: string): Promise<FeedbackContext> {
  const supabase = createAdminClient();

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
  memberId: string,
  matchIds: string[],
  input: SubmitFeedbackInput,
): Promise<{ success: boolean }> {
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
