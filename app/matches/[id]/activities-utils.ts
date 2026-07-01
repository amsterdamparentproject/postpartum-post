import type { Activity } from "@/lib/activities";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface MemberAvailability {
  name: string;
  days: string[]; // lowercase: "monday", "tuesday", …
}

export type Tab = "places" | "activities" | "playgrounds";
export type SortOrder = "score" | "alpha" | "date" | "distance";

export interface WeekGroup {
  ws: string;
  label: string;
  items: Activity[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MEMBER_COLORS = ["#C56850", "#9B7355"] as const;

export const DAY_NAMES = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

export const PLACE_SORTS: { label: string; value: SortOrder }[] = [
  { label: "Best location", value: "score" },
  { label: "Alphabetical", value: "alpha" },
];

export const ACTIVITY_SORTS: { label: string; value: SortOrder }[] = [
  { label: "Date", value: "date" },
  { label: "Best location", value: "score" },
  { label: "Alphabetical", value: "alpha" },
];

export const PLAYGROUND_SORTS: { label: string; value: SortOrder }[] = [
  { label: "Best location", value: "distance" },
  { label: "Alphabetical", value: "alpha" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function locationText(a: Activity): string | null {
  return a.location ?? a.neighborhood ?? a.area ?? null;
}

const DAYS_SHORT   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getRepeatLabel(rrule?: string | null): string {
  if (!rrule) return "";
  const freq     = (rrule.match(/FREQ=([A-Z]+)/i)?.[1] ?? "").toUpperCase();
  const interval = parseInt(rrule.match(/INTERVAL=(\d+)/i)?.[1] ?? "1", 10);
  if (freq === "DAILY")                         return "Daily";
  if (freq === "WEEKLY"   && interval === 1)    return "Weekly";
  if (freq === "WEEKLY"   && interval === 2)    return "Every 2 weeks";
  if (freq === "BIWEEKLY")                      return "Every 2 weeks";
  if (freq === "MONTHLY")                       return "Monthly";
  return "";
}

/** Newsletter-style meta line: "Wed 18 Jun @ 10:00 (Weekly) — Jordaan" */
export function formatMeta(a: Activity): string | null {
  if (a.kind !== "event") return null;
  const date = effectiveDate(a);
  const parts: string[] = [];

  if (date) {
    const d = new Date(date.slice(0, 10) + "T00:00:00");
    let datePart = `${DAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
    if (a.start_time) {
      datePart += ` @ ${a.start_time.slice(0, 5)}`;
      if (a.end_time) datePart += `–${a.end_time.slice(0, 5)}`;
    }
    const repeat = getRepeatLabel(a.repeat_rrule);
    if (repeat) datePart += ` (${repeat})`;
    parts.push(datePart);
  }

  if (a.neighborhood) parts.push(`— ${a.neighborhood}`);

  return parts.length > 0 ? parts.join(" ") : null;
}

/** @deprecated use formatMeta for events */
export function formatDate(
  start_date: string,
  start_time: string | null | undefined,
): string {
  const date = new Date(
    start_date.slice(0, 10) + "T00:00:00",
  ).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (!start_time) return date;
  return `${date} · ${start_time.slice(0, 5)}`;
}

export function effectiveDate(a: Activity): string | null {
  if (a.kind === "event") return (a.repeat_next_date ?? a.start_date) ?? null;
  return null;
}

/** Derive day-of-week from the effective display date, not the stored day_of_week field */
export function effectiveDayOfWeek(a: Activity): string | null {
  const date = effectiveDate(a);
  if (!date) return null;
  return DAY_NAMES[new Date(date.slice(0, 10) + "T00:00:00").getDay()];
}

/**
 * Parse a RRULE string and return the step in days between occurrences.
 * Supports FREQ=WEEKLY/DAILY/BIWEEKLY with optional INTERVAL=N.
 * Returns null for frequencies we can't expand (e.g. MONTHLY).
 */
function rruleStepDays(rrule: string | null | undefined): number | null {
  if (!rrule) return 7; // no rule → assume weekly
  const freq = (rrule.match(/FREQ=([A-Z]+)/i)?.[1] ?? "WEEKLY").toUpperCase();
  const interval = parseInt(rrule.match(/INTERVAL=(\d+)/i)?.[1] ?? "1", 10);
  if (freq === "DAILY")    return 1 * interval;
  if (freq === "WEEKLY")   return 7 * interval;
  if (freq === "BIWEEKLY") return 14 * interval; // non-standard but common
  return null; // MONTHLY etc. — don't try to expand
}

/**
 * All dates (YYYY-MM-DD) within [monthStart, monthEnd) that this event should
 * appear on in the calendar:
 *   - Recurring (has repeat_next_date): every weekly occurrence in the month
 *   - Multi-day (end_date > start_date): every day of the span within the month
 *   - Single-day: just the effective date
 */
export function calendarDates(
  a: Activity,
  monthStart: string,
  monthEnd: string, // exclusive upper bound
): string[] {
  if (a.kind !== "event") return [];

  const repeatDate = a.repeat_next_date?.slice(0, 10) ?? null;
  const startDate = a.start_date?.slice(0, 10) ?? null;
  const endDate = a.end_date?.slice(0, 10) ?? null;

  // Recurring: step forward from repeat_next_date by the rrule interval
  if (repeatDate) {
    const step = rruleStepDays(a.repeat_rrule);
    if (step === null) {
      // Can't expand (e.g. monthly) — just show the single repeat_next_date
      return repeatDate >= monthStart && repeatDate < monthEnd ? [repeatDate] : [];
    }
    // Walk backward from repeat_next_date to find the first occurrence in or before monthStart
    const anchor = new Date(repeatDate + "T00:00:00");
    const mStart = new Date(monthStart + "T00:00:00");
    const mEnd   = new Date(monthEnd   + "T00:00:00");
    // Step back until before monthStart, then step forward
    while (anchor >= mStart) anchor.setDate(anchor.getDate() - step);
    anchor.setDate(anchor.getDate() + step); // first occurrence >= monthStart
    const dates: string[] = [];
    const cur = new Date(anchor);
    while (cur < mEnd) {
      dates.push(toLocalDateStr(cur));
      cur.setDate(cur.getDate() + step);
    }
    return dates;
  }

  // Multi-day: every day in the span that falls within the month
  if (startDate && endDate && endDate > startDate) {
    const rangeStart = startDate < monthStart ? monthStart : startDate;
    const rangeEnd   = endDate   > monthEnd   ? monthEnd   : endDate;
    const dates: string[] = [];
    const cur = new Date(rangeStart + "T00:00:00");
    const end = new Date(rangeEnd   + "T00:00:00");
    // rangeEnd is the last day to include (end_date is inclusive)
    while (cur <= end && toLocalDateStr(cur) < monthEnd) {
      dates.push(toLocalDateStr(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }

  // Single day
  const d = effectiveDate(a);
  return d ? [d.slice(0, 10)] : [];
}

/** Format a Date as YYYY-MM-DD in local time (avoids UTC offset shifting) */
export function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekStart(dateStr: string): string {
  const d = new Date(dateStr.slice(0, 10) + "T00:00:00");
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return toLocalDateStr(d);
}

function weekLabel(ws: string): string {
  const d = new Date(ws + "T00:00:00");
  return (
    "Week of " +
    d.toLocaleDateString("en-US", { month: "long", day: "numeric" })
  );
}

/** 7-day range Mon–Sun for a week start */
export function weekDays(ws: string): Date[] {
  const days: Date[] = [];
  const d = new Date(ws + "T00:00:00");
  for (let i = 0; i < 7; i++) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

/** All Mondays (as YYYY-MM-DD) that have at least one day in the given month */
export function monthWeekStarts(matchedOn: string): string[] {
  const monthStr = matchedOn.slice(0, 7);
  const firstDay = new Date(monthStr + "-01T00:00:00");
  const lastDay = new Date(firstDay);
  lastDay.setMonth(lastDay.getMonth() + 1);
  lastDay.setDate(lastDay.getDate() - 1);

  const startMon = new Date(firstDay);
  const d0 = startMon.getDay();
  startMon.setDate(startMon.getDate() - (d0 === 0 ? 6 : d0 - 1));

  const weeks: string[] = [];
  const cur = new Date(startMon);
  while (cur <= lastDay) {
    weeks.push(toLocalDateStr(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

export function groupByWeek(
  items: Activity[],
): { groups: WeekGroup[]; undated: Activity[] } {
  const map = new Map<string, Activity[]>();
  const undated: Activity[] = [];
  for (const a of items) {
    const date = effectiveDate(a);
    if (!date) {
      undated.push(a);
      continue;
    }
    const ws = weekStart(date);
    if (!map.has(ws)) map.set(ws, []);
    map.get(ws)!.push(a);
  }
  const groups: WeekGroup[] = [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ws, its]) => ({
      ws,
      label: weekLabel(ws),
      items: its.sort((a, b) => {
        const dateCmp = (effectiveDate(a) ?? "").localeCompare(effectiveDate(b) ?? "");
        if (dateCmp !== 0) return dateCmp;
        return (a.start_time ?? "").localeCompare(b.start_time ?? "");
      }),
    }));
  return { groups, undated };
}
