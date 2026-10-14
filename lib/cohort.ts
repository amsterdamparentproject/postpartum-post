import type { createAdminClient } from "@/lib/supabase";

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
  active: boolean;
};

const COHORT_COLUMNS = "slug, name, signup_cap, grant_matches, active";

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

/** What redeeming or signing up with a code needs to know about a cohort. */
export type CodeCohort = {
  slug: string;
  name: string;
  signup_cap: number | null;
  grant_matches: number;
};

/**
 * Finds the active cohort a signup code belongs to (codes are unique, stored
 * matched exactly, case included). Null for a blank, unknown or
 * inactive code, so callers can answer all three the same way.
 */
export async function findCohortByCode(supabase: AdminClient, code: string): Promise<CodeCohort | null> {
  const normalized = code.trim();
  if (!normalized) return null;
  const { data, error } = await supabase
    .from("cohorts")
    .select("slug, name, signup_cap, grant_matches")
    .eq("signup_code", normalized)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(`findCohortByCode failed: ${error.message}`);
  return (data as CodeCohort | null) ?? null;
}

/**
 * True when the cohort has a cap and its members already fill it. Checked with
 * a count before the write, so two simultaneous signups for the last place can
 * overshoot by one. Fine at this scale. Throws on a lookup failure.
 */
export async function cohortIsFull(supabase: AdminClient, cohort: Pick<CodeCohort, "slug" | "signup_cap">): Promise<boolean> {
  if (cohort.signup_cap === null) return false;
  const { count, error } = await supabase
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("cohort", cohort.slug);
  if (error || count === null) throw new Error(`cohortIsFull failed: ${error?.message ?? "no count"}`);
  return count >= cohort.signup_cap;
}

/**
 * Decides what to store in monthly_participation.cohort_only when a member
 * opts into a round: their own standing choice (members.cohort_only), which
 * defaults to true. A member with a cohort is matched only inside it until they
 * pick "Anyone" on /profile or /matches; a member without a cohort never is.
 *
 * Throws on a lookup failure instead of defaulting to false: failing open would
 * pair a cohort member outside the cohort.
 */
export async function resolveCohortOnly(supabase: AdminClient, memberId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("members")
    .select("cohort, cohort_only")
    .eq("id", memberId)
    .single();
  if (error || !data) {
    throw new Error(`resolveCohortOnly: member lookup failed: ${error?.message ?? "not found"}`);
  }
  return !!data.cohort && data.cohort_only !== false;
}
