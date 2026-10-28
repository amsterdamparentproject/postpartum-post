/**
 * Dev-only test match generator (the panel at the bottom of /matches/[id]).
 * Shared by the loader, the server action and the panel, so it imports nothing
 * server-only.
 *
 * It rewrites the signed-in member's cohort and billing mode, so it is locked
 * down three ways: never in a production build, never against the production
 * Supabase project, and only for one test email.
 */

/** The production Supabase project; the tool refuses to touch it even from a dev server. */
const PROD_PROJECT_REF = "lchjodrcpfauvkxnhnxe";

/** The one account allowed to use the tool (override with DEV_TOOLS_EMAIL in .env.local). */
const DEFAULT_DEV_EMAIL = "amsterdamparentproject@gmail.com";

export function devToolsEnabledFor(email: string | null | undefined): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if ((process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes(PROD_PROJECT_REF)) return false;
  const allowed = (process.env.DEV_TOOLS_EMAIL ?? DEFAULT_DEV_EMAIL).trim().toLowerCase();
  return !!email && email.trim().toLowerCase() === allowed;
}

/**
 * Who the signed-in test account and its match are. Billing is set per side
 * because Perks visibility follows the viewer's plan, so the mixed pairs come
 * in both orientations. "No cohort, subscriber" is the normal state, so it
 * doubles as the reset.
 */
type Side = { cohort: "dsa" | null; billing_mode: "comped_no_perks" | "subscription" };
export const DEV_SCENARIOS: Record<string, { label: string; me: Side; match: Side }> = {
  cohort_comped: {
    label: "Cohort, comped · match: cohort, comped",
    me: { cohort: "dsa", billing_mode: "comped_no_perks" },
    match: { cohort: "dsa", billing_mode: "comped_no_perks" },
  },
  cohort_subscriber: {
    label: "Cohort, subscriber · match: cohort, subscriber",
    me: { cohort: "dsa", billing_mode: "subscription" },
    match: { cohort: "dsa", billing_mode: "subscription" },
  },
  mixed_me_comped: {
    label: "Cohort, comped · match: cohort, subscriber",
    me: { cohort: "dsa", billing_mode: "comped_no_perks" },
    match: { cohort: "dsa", billing_mode: "subscription" },
  },
  mixed_me_subscriber: {
    label: "Cohort, subscriber · match: cohort, comped",
    me: { cohort: "dsa", billing_mode: "subscription" },
    match: { cohort: "dsa", billing_mode: "comped_no_perks" },
  },
  regular_subscriber: {
    label: "No cohort, subscriber · match: same",
    me: { cohort: null, billing_mode: "subscription" },
    match: { cohort: null, billing_mode: "subscription" },
  },
};
export type DevScenario = keyof typeof DEV_SCENARIOS;

/** How far apart the pair lives. */
export const DEV_DISTANCES = {
  local: "Nearby (~5 km)",
  online: "Far apart (~33 km)",
  unknown: "Partner's location missing",
} as const;
export type DevDistance = keyof typeof DEV_DISTANCES;

/** Fixed ids: the tool reuses one partner and one match, so the page URL never changes. */
export const DEV_PARTNER_ID = "5eed0003-0000-4000-8000-000000000001";
export const DEV_MATCH_ID = "5eed0004-0000-4000-8000-000000000001";
