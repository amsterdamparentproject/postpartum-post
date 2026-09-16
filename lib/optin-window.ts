/**
 * The monthly opt-in window: the 1st through the 5th of the month, inclusive
 * — anchored to Europe/Amsterdam local time, not the runtime's own timezone.
 *
 * The opt-in email goes out on the 1st (see app/api/send-optin-email), and
 * members have until the end of the 5th (Amsterdam time) to choose
 * coffee/playdate/skip before the matcher runs at midnight Amsterdam time on
 * the 6th (n8n/postpartum-post-matching.json, "6th, midnight — Run matcher",
 * workflow timezone "Europe/Amsterdam"). Anyone who joins after that day's
 * email batch has already gone out — or any member who just hasn't
 * responded yet — is still inside this window and should be nudged in-app
 * instead of relying on the email.
 *
 * Explicitly reading the Amsterdam day (via Intl) rather than
 * `now.getDate()` matters here: this same check runs both in the browser
 * (a member's local timezone, usually but not guaranteed to be Amsterdam)
 * and on the server (optInFromMatches in matches/actions.ts — server
 * functions typically run in UTC). Using the server's raw local day would
 * let the window silently close a day early during winter or open extra
 * hours late relative to when the matcher actually fires.
 */
export const OPTIN_DEADLINE_DAY = 5;

const AMSTERDAM_TZ = "Europe/Amsterdam";

function amsterdamDayOfMonth(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: AMSTERDAM_TZ, day: "numeric" }).format(now)
  );
}

export function isOptinWindowOpen(now: Date = new Date()): boolean {
  return amsterdamDayOfMonth(now) <= OPTIN_DEADLINE_DAY;
}

/**
 * Days left to opt in, counting the deadline day itself as 1 (not 0) so the
 * copy reads "1 day left" rather than "0 days left" on the last day.
 * Meaningless once isOptinWindowOpen() is false — callers should check that
 * first (or just not render anything when this returns <= 0).
 */
export function daysLeftToOptin(now: Date = new Date()): number {
  return Math.max(0, OPTIN_DEADLINE_DAY - amsterdamDayOfMonth(now) + 1);
}

/**
 * The Amsterdam UTC offset (in minutes) actually in effect at `date` — +1h
 * (CET) roughly Nov-Mar, +2h (CEST) roughly Mar-Oct. Read via Intl rather
 * than hardcoded, so it stays correct across the DST transition without
 * tracking the EU's specific transition dates here.
 */
function amsterdamOffsetMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: AMSTERDAM_TZ,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  const match = tzName.match(/GMT([+-]\d+)/);
  return (match ? parseInt(match[1], 10) : 1) * 60;
}

/**
 * The exact instant the opt-in window for `month` (YYYY-MM) closes — 00:00
 * Amsterdam time on the 6th, the same moment the matcher runs (see this
 * file's top docblock). Returned as a UTC ISO string, for comparing against
 * a Postgres timestamptz column (e.g. members.created_at) directly: a
 * member with created_at at or after this instant joined too late to have
 * had any opt-in window for `month`'s round at all — see getMatchRoundStats
 * (app/admin/stats/actions.ts), which uses this to split "joined after
 * round" out from genuine non-responders.
 *
 * Safe to resolve the UTC offset from a same-day UTC guess rather than the
 * true target instant (up to ~2h off): the 6th of any month never falls
 * near the EU's actual DST transition (last Sunday of March/October), so
 * both instants always share one unambiguous offset.
 */
export function optinDeadlineUTC(month: string): string {
  const [year, mo] = month.split("-").map(Number);
  const guess = new Date(Date.UTC(year, mo - 1, OPTIN_DEADLINE_DAY + 1, 0, 0, 0));
  const offsetMinutes = amsterdamOffsetMinutes(guess);
  return new Date(guess.getTime() - offsetMinutes * 60_000).toISOString();
}
