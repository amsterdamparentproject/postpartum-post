"use server";

import { createAdminClient } from "@/lib/supabase";
import { verifySkipToken, monthToDate } from "@/lib/tokens";

export type SkipStatus = "ok" | "already_skipped" | "invalid_token" | "not_found";
export type SkipResult = { status: SkipStatus; email?: string };

export async function recordSkip(
  memberId: string,
  month: string, // YYYY-MM
  token: string
): Promise<SkipResult> {
  // 1. Verify token — prevents spoofed skip links
  if (!verifySkipToken(memberId, month, token)) return { status: "invalid_token" };

  const supabase = createAdminClient();

  // 2. Fetch member — include email so we can pass it to the confirmed page for re-auth
  const { data: member } = await supabase
    .from("members")
    .select("id, email, consecutive_skips")
    .eq("id", memberId)
    .single();

  if (!member) return { status: "not_found" };

  // 3. Idempotency — don't double-record a skip
  const monthDate = monthToDate(month);
  const { data: existingSkip } = await supabase
    .from("monthly_skips")
    .select("id")
    .eq("member_id", memberId)
    .eq("month", monthDate)
    .maybeSingle();

  if (existingSkip) return { status: "already_skipped", email: member.email };

  // 4. Record the skip
  await supabase
    .from("monthly_skips")
    .insert({ member_id: memberId, month: monthDate });

  // 5. Increment consecutive_skips counter
  const newConsecutiveSkips = (member.consecutive_skips ?? 0) + 1;
  await supabase
    .from("members")
    .update({ consecutive_skips: newConsecutiveSkips })
    .eq("id", memberId);

  // No auto-pause: skipping is free and never uses a match, so a member can stay
  // subscribed indefinitely. consecutive_skips is kept as a cached streak
  // counter for analytics (monthly_skips is the source of truth).

  return { status: "ok", email: member.email };
}
