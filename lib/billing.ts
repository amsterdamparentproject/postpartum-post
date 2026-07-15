const FIRST_MATCH_DATE = new Date("2026-07-05T00:00:00Z");

// Rolls a date forward to the next 5th-of-month at or after it — the same
// month's 5th if the date hasn't reached it yet, otherwise (including if the
// date IS exactly that 5th) next month's 5th. Reaching the boundary always
// means "the next occurrence," which is the right rule everywhere this is
// used: nextMatchDate() below ("what's the next match from now") and
// extendSubscriptionToNext5th() in subscription-utils.ts ("push this
// subscription's next charge out by one cycle" — the input there is always
// an already-scheduled date, so landing exactly on it still means move to
// the next one).
export function extendToNext5thOfMonth(date: Date): Date {
  const candidate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 5));
  if (date >= candidate) {
    candidate.setUTCMonth(candidate.getUTCMonth() + 1);
  }
  return candidate;
}

export function nextMatchDate(): number {
  const target = extendToNext5thOfMonth(new Date());
  const final = target < FIRST_MATCH_DATE ? FIRST_MATCH_DATE : target;
  return Math.floor(final.getTime() / 1000);
}
