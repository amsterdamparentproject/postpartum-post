"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase";
import { sendRematchConfirmationEmail } from "@/lib/emails/rematch-confirmation";

export async function requestRematch(memberId: string, reason: string | null, matchId?: string) {
  const supabase = createAdminClient();

  // Use the provided matchId, or fall back to the most recent current-month match
  let match: { id: string; member_id_1: string; member_id_2: string } | null = null;

  if (matchId) {
    const { data, error } = await supabase
      .from("matches")
      .select("id, member_id_1, member_id_2")
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
      .select("id, member_id_1, member_id_2")
      .or(`member_id_1.eq.${memberId},member_id_2.eq.${memberId}`)
      .gte("matched_on", startOfMonth.toISOString().split("T")[0])
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (error || !data) throw new Error("No match found for this month");
    match = data;
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

  if (requestingMember) {
    await sendRematchConfirmationEmail(requestingMember.email, requestingMember.first_name).catch(
      (err) => console.error("[rematch] confirmation email failed:", err)
    );
  }

  redirect("/rematch/confirmed");
}
