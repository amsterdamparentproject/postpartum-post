import type { Activity } from "@/lib/activities";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface MemberAvailability {
  name: string;
  days: string[]; // lowercase: "monday", "tuesday", …
}

export type Tab = "places" | "activities";
export type SortOrder = "score" | "alpha" | "date";

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function locationText(a: Activity): string | null {
  return a.location ?? a.neighborhood ?? a.area ?? null;
}

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
      items: its.sort(
        (a, b) =>
          (effectiveDate(a) ?? "").localeCompare(effectiveDate(b) ?? ""),
      ),
    }));
  return { groups, undated };
}
