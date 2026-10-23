import { cohortHeader, COHORT_HEADER_PRELOAD } from "@/lib/emails/welcome-cohort";

/**
 * Per-cohort email extras, keyed by cohorts.slug. Everything is optional: a
 * cohort with no entry (or an entry without a given field) gets the generic
 * version of that piece, so a new cohort sends sensible emails before anyone
 * writes it a bespoke one.
 *
 * Plain code on purpose (not a column): copy and images are reviewed in git
 * like every other email. The slug must match cohorts.slug exactly; a
 * mismatch silently falls back to the generic email.
 */
export type CohortConfig = {
  /** Replaces the standard header at the top of the cohort's welcome and opt-in emails. */
  headerHtml?: string;
  /** Goes in the email's <head> so the header image above loads early. */
  headerPreload?: string;
  /** Extra paragraph in the opt-in email, plain text (escaped by the template). */
  optinNote?: { lead?: string; body: string };
  /** Welcome email: sentence about who the member will be matched with. Plain text. */
  welcomeMatchLine?: string;
  /** Welcome email: closing sentence saying the match is a gift and nothing renews. Plain text. */
  welcomeGiftLine?: string;
  /** Welcome email: closing sentence about what happens after the free match. Plain text. */
  welcomeContinueLine?: string;
};

export const COHORT_CONFIG: Record<string, CohortConfig> = {
  dsa: {
    headerHtml: cohortHeader(),
    headerPreload: COHORT_HEADER_PRELOAD,
    optinNote: {
      lead: "Live outside Amsterdam?",
      body: "No problem: Dutch Speaking Academy parents live all over, so you can be matched wherever you are. If you live near each other, try to meet in person! If not, a video call is a great way to practice Dutch together. You'll agree on what works once you're introduced.",
    },
    welcomeMatchLine:
      "Every round starts with a hand-picked introduction, delivered via email. Your match will be another parent from Dutch Speaking Academy to practice real Dutch with, in person if you live nearby or on a video call if you don't.",
    welcomeGiftLine: "Your match is a gift from your course — no charge, and nothing renews on its own.",
    welcomeContinueLine:
      "If you want to continue practicing Dutch and/or meeting new parents afterwards, keep an eye on your inbox after the next round has finished!",
  },
};

/** The config for a cohort slug, or an empty one (all generic) when there is none. */
export function getCohortConfig(slug: string | null | undefined): CohortConfig {
  return (slug && COHORT_CONFIG[slug]) || {};
}
