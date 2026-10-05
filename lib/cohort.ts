import type { createAdminClient } from "@/lib/supabase";
import { isComped } from "@/lib/billing-mode";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Cohort slugs set at signup (members.cohort). Attribution only, never cleared. */
export const COHORT_DSA = "dsa";

/** Label for the opt-in checkbox, per cohort. */
export const COHORT_ONLY_LABELS: Record<string, string> = {
  [COHORT_DSA]: "Match me only with another DSA student",
};

/**
 * Decides what to store in monthly_participation.cohort_only when a member
 * opts into a round.
 *
 * - comped members (either kind) in a cohort are always cohort-only (the checkbox is shown disabled);
 * - other members with a cohort get whatever they asked for;
 * - everyone else is never cohort-only.
 *
 * Throws on a lookup failure instead of defaulting to false: for a comped
 * member, failing open would let the matcher pair them outside the cohort.
 */
export async function resolveCohortOnly(
  supabase: AdminClient,
  memberId: string,
  requested = false
): Promise<boolean> {
  const { data, error } = await supabase
    .from("members")
    .select("cohort, billing_mode")
    .eq("id", memberId)
    .single();
  if (error || !data) {
    throw new Error(`resolveCohortOnly: member lookup failed: ${error?.message ?? "not found"}`);
  }
  if (!data.cohort) return false;
  if (isComped(data.billing_mode)) return true;
  return requested;
}
