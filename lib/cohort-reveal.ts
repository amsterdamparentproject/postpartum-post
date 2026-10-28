import { getCohortConfig } from "@/lib/cohort-config";
import type { CohortRevealOptions } from "@/lib/emails/match-reveal";

/**
 * The cohort version of the match reveal email for a pair, or null for a
 * regular pair. A pair is a cohort pair when both members share a cohort (the
 * same rule as the match page). `names` is slug -> display name (getCohortNames);
 * a missing name falls back to "your partner program" rather than to the
 * regular email's "in Amsterdam" wording.
 */
export function cohortRevealFor(
  cohort1: string | null | undefined,
  cohort2: string | null | undefined,
  names: Map<string, string>,
): CohortRevealOptions | null {
  const shared = cohort1 && cohort1 === cohort2 ? cohort1 : null;
  if (!shared) return null;
  const config = getCohortConfig(shared);
  return {
    name: names.get(shared) ?? "your partner program",
    headerHtml: config.headerHtml ?? null,
    headerPreload: config.headerPreload ?? null,
    // No topic or distance in this email: the generic "plan our meetup" subject.
    emailSubject: config.matchPage?.emailSubject?.({ topic: null, mode: "unknown" }) ?? null,
  };
}
