import { createAdminClient } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof createAdminClient>;

/**
 * Whether a member has responded to this month's opt-in at all -- coffee,
 * playdate, or "no match, just perks" (monthly_participation or
 * monthly_perks respectively; see db/migrations/029_monthly_perks.sql).
 * Skipping (monthly_skips) or not responding at all does NOT count.
 *
 * This is the single source of truth for "does this member have Perks
 * access this month" (my-perks/actions.ts) and for what the /my-perks
 * empty-state should show. `monthDate` must be the first-of-month date
 * string (YYYY-MM-01) already used for monthly_participation/monthly_perks
 * elsewhere in that same call site -- callers own computing it themselves
 * (rather than this helper picking a "current month" of its own) so it
 * can't quietly disagree with whatever month a caller just wrote to.
 */
export async function hasOptedInForMonth(
  supabase: SupabaseClient,
  memberId: string,
  monthDate: string
): Promise<boolean> {
  const [{ data: participation }, { data: perks }] = await Promise.all([
    supabase
      .from("monthly_participation")
      .select("id")
      .eq("member_id", memberId)
      .eq("month", monthDate)
      .maybeSingle(),
    supabase
      .from("monthly_perks")
      .select("id")
      .eq("member_id", memberId)
      .eq("month", monthDate)
      .maybeSingle(),
  ]);
  return !!participation || !!perks;
}
