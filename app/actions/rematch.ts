"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase";

export async function requestRematch(memberId: string, reason: string | null) {
  const supabase = createAdminClient();

  // Find this month's match for the member
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data: match, error } = await supabase
    .from("matches")
    .select("id")
    .or(`member_id_1.eq.${memberId},member_id_2.eq.${memberId}`)
    .gte("matched_on", startOfMonth.toISOString().split("T")[0])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !match) {
    throw new Error("No match found for this month");
  }

  await supabase
    .from("matches")
    .update({
      rematch_requested: true,
      rematch_reason: reason,
      rematch_requested_at: new Date().toISOString(),
    })
    .eq("id", match.id);

  redirect("/rematch/confirmed");
}
