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
