const FIRST_MATCH_DATE = new Date("2026-07-05T00:00:00Z");

export function nextMatchDate(): number {
  const now = new Date();
  const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 5));
  if (now >= candidate) {
    candidate.setUTCMonth(candidate.getUTCMonth() + 1);
  }
  const target = candidate < FIRST_MATCH_DATE ? FIRST_MATCH_DATE : candidate;
  return Math.floor(target.getTime() / 1000);
}

// Returns true when the next match date falls in a different month than today,
// meaning the subscription should be extended to avoid charging before the first match.
export function needsBillingExtension(): boolean {
  const now = new Date();
  const nextMatch = new Date(nextMatchDate() * 1000);
  return (
    nextMatch.getUTCFullYear() !== now.getUTCFullYear() ||
    nextMatch.getUTCMonth() !== now.getUTCMonth()
  );
}
