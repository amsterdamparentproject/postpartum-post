import type { createAdminClient } from "@/lib/supabase";
import { isComped } from "@/lib/billing-mode";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * A partner cohort (one row of the cohorts table, migration 034). This is the
 * non-secret part: the signup code is read only inside signupCohort and never
 * leaves the server.
 */
export type Cohort = {
  slug: string;
  name: string;
  signup_cap: number | null;
  grant_matches: number;
  restrict_while_comped: boolean;
  offers_choice: boolean;
  active: boolean;
};

const COHORT_COLUMNS = "slug, name, signup_cap, grant_matches, restrict_while_comped, offers_choice, active";

/** Loads one cohort, or null when the slug has no row. Throws on a lookup error. */
export async function getCohort(supabase: AdminClient, slug: string): Promise<Cohort | null> {
  const { data, error } = await supabase.from("cohorts").select(COHORT_COLUMNS).eq("slug", slug).maybeSingle();
  if (error) throw new Error(`getCohort(${slug}) failed: ${error.message}`);
  return (data as Cohort | null) ?? null;
}

/** slug -> display name for every cohort. Display only, so a failure returns an empty map. */
export async function getCohortNames(supabase: AdminClient): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("cohorts").select("slug, name");
  if (error) {
    console.error("[getCohortNames] lookup failed:", error.message);
    return new Map();
  }
  return new Map((data ?? []).map((c) => [c.slug as string, c.name as string]));
}

/** Label for the opt-in checkbox of a cohort. */
export function cohortOnlyLabel(name: string | null | undefined): string {
  return name ? `Match me only with someone from ${name}` : "Match me only with someone from my cohort";
}

/**
 * Decides what to store in monthly_participation.cohort_only when a member
 * opts into a round.
 *
 * - no cohort: never cohort-only;
 * - comped member in a cohort that restricts comped members: always cohort-only
 *   (the checkbox is shown disabled);
 * - otherwise whatever the member asked for, if the cohort offers the choice.
 *
 * Throws on a lookup failure (or a cohort with no row) instead of defaulting to
 * false: for a comped member, failing open would let the matcher pair them
 * outside the cohort.
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

  const cohort = await getCohort(supabase, data.cohort);
  if (!cohort) {
    throw new Error(`resolveCohortOnly: member ${memberId} has cohort "${data.cohort}" with no cohorts row`);
  }
  if (isComped(data.billing_mode) && cohort.restrict_while_comped) return true;
  return cohort.offers_choice ? requested : false;
}
