/**
 * lib/activities.ts
 *
 * Fetches and scores activities from two tables in the `activities` schema:
 *   - events    (dated, have day_of_week for availability matching)
 *   - locations (physical venues / places)
 *
 * Scoring priority:
 *   1. Availability — Jaccard overlap of pair's shared days vs event day_of_week
 *   2. Distance     — Haversine from pair midpoint (all three tables have lat/lng)
 *   3. Age          — deferred until min_age_months / max_age_months columns exist
 *
 * postpartum_post filter: only rows with postpartum_post = true are shown.
 */

import { createActivitiesClient } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActivityKind = "event" | "location";

export interface Activity {
  id: string;
  kind: ActivityKind;
  title: string;
  description: string | null;
  url: string | null;
  organization: string | null;
  location: string | null;
  neighborhood: string | null;
  area: string | null;
  lat: number | null;
  lng: number | null;
  categories: string[];
  age_categories: string[];
  /** Events only */
  start_date?: string;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  day_of_week?: string | null;
  repeat_next_date?: string | null;
  tagline?: string | null;
  newsletter_description?: string | null;
  repeat_rrule?: string | null;
  /** Computed */
  score: number;
  isRecommended: boolean;
}

export type ChildRecord = { birth_month: number; birth_year: number; expected: boolean };

export interface MatchProfile {
  /** Midpoint of the two members' coordinates */
  center: { lat: number; lng: number } | null;
  /** Union of both members' availability days (used for scoring) */
  availabilityDays: string[];
  /** Each member's individual availability days (used for "both can attend" prioritization) */
  member1Days: string[];
  member2Days: string[];
  /** Children for each member, used for age-bucket filtering */
  member1Children: ChildRecord[];
  member2Children: ChildRecord[];
  /** The match's month date (YYYY-MM-DD), used to filter events to this month */
  matchedOn: string;
}

// ---------------------------------------------------------------------------
// Age bucket helpers
// ---------------------------------------------------------------------------

/** Age tags used in activities.categories. Must match values in the DB. */
const AGE_TAGS = new Set(["expecting", "newborn", "baby", "toddler", "all ages"]);

/** Maps a child record to its age bucket tag, or null if over 4 years. */
export function childAgeBucket(c: ChildRecord): string | null {
  if (c.expected) return "expecting";
  const now = new Date();
  const birthDate = new Date(c.birth_year, c.birth_month - 1, 1);
  const ageMonths = Math.floor((now.getTime() - birthDate.getTime()) / (1_000 * 60 * 60 * 24 * 30.44));
  if (ageMonths < 4)  return "newborn";
  if (ageMonths < 12) return "baby";
  if (ageMonths < 48) return "toddler";
  return null; // over 4 years — no specific bucket
}

/**
 * Returns true if the activity's age categories are compatible with the pair's children.
 *
 * Rules:
 *   - No age tags on the activity → include (untagged = not yet curated, don't penalize)
 *   - "all ages" tag → always include
 *   - At least one age tag matches a pair bucket → include
 *   - Age tags present but none match → exclude
 */
function ageCompatible(age_categories: string[], pairBuckets: Set<string>): boolean {
  if (age_categories.length === 0) return true;           // untagged — neutral
  if (age_categories.includes("all ages")) return true;   // always suitable
  if (pairBuckets.size === 0) return true;                // no children data — don't penalize
  return age_categories.some((t) => pairBuckets.has(t));
}

// ---------------------------------------------------------------------------
// Geo helpers
// ---------------------------------------------------------------------------

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** 0–1: 1 = within 1 km, 0 = 15+ km away */
function distanceScore(
  center: { lat: number; lng: number },
  lat: number | null,
  lng: number | null,
): number {
  if (lat == null || lng == null) return 0.3; // neutral for missing coords
  const km = haversineKm(center, { lat, lng });
  return Math.max(0, 1 - km / 15);
}

// ---------------------------------------------------------------------------
// Availability helpers
// ---------------------------------------------------------------------------

/** Normalise day strings to lowercase for comparison */
function normDays(days: string[]): Set<string> {
  return new Set(days.map((d) => d.toLowerCase()));
}

const DAY_NAMES = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

/** Derive day-of-week from the effective display date (repeat_next_date ?? start_date) */
function derivedDayOfWeek(a: Omit<Activity, "score" | "isRecommended">): string | null {
  if (a.kind !== "event") return null;
  const dateStr = (a.repeat_next_date ?? a.start_date)?.slice(0, 10);
  if (!dateStr) return null;
  return DAY_NAMES[new Date(dateStr.slice(0, 10) + "T00:00:00").getDay()];
}

/** 0–1: fraction of pair's shared days that overlap with the activity day */
function availabilityScore(
  pairDays: string[],
  activityDay: string | null | undefined,
): number {
  if (!activityDay || pairDays.length === 0) return 0.5; // neutral
  const dayLower = activityDay.toLowerCase();
  const pairSet = normDays(pairDays);

  // Check direct day match
  if (pairSet.has(dayLower)) return 1;

  // Weekend / weekday buckets
  const weekendDays = new Set(["saturday", "sunday"]);
  const weekdayDays = new Set(["monday", "tuesday", "wednesday", "thursday", "friday"]);
  const isWeekend = weekendDays.has(dayLower);
  const pairHasWeekend = [...pairSet].some((d) => weekendDays.has(d));
  const pairHasWeekday = [...pairSet].some((d) => weekdayDays.has(d));

  if (isWeekend && pairHasWeekend) return 0.8;
  if (!isWeekend && pairHasWeekday) return 0.6;
  return 0;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const WEIGHTS = {
  availability: 0.5,
  age: 0.3,
  distance: 0.2,
};

/** 0–1: 1.0 = direct bucket match, 0.7 = "all ages", 0.5 = untagged (neutral) */
function ageScore(age_categories: string[], pairBuckets: Set<string>): number {
  if (age_categories.length === 0) return 0.5;
  if (age_categories.includes("all ages")) return 0.7;
  return age_categories.some((t) => pairBuckets.has(t)) ? 1 : 0;
}

function scoreActivity(
  activity: Omit<Activity, "score" | "isRecommended">,
  profile: MatchProfile,
  pairBuckets: Set<string>,
): number {
  const avail = availabilityScore(
    profile.availabilityDays,
    derivedDayOfWeek(activity),
  );
  const age  = ageScore(activity.age_categories, pairBuckets);
  const dist = profile.center
    ? distanceScore(profile.center, activity.lat, activity.lng)
    : 0.5;

  return WEIGHTS.availability * avail + WEIGHTS.age * age + WEIGHTS.distance * dist;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

type RawEvent = {
  id: string;
  title: string;
  description: string;
  url: string | null;
  organization: string | null;
  location: string | null;
  neighborhood: string | null;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
  categories: string[] | null;
  age_categories: string[] | null;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  day_of_week: string | null;
  repeat_next_date: string | null;
  tagline: string | null;
  newsletter_description: string | null;
  repeat_rrule: string | null;
};

type RawLocation = {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
  address: string | null;
  neighborhood: string | null;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
  age_categories: string[] | null;
};

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export interface ActivitiesResult {
  /** Top 5 locations by score */
  recommendedPlaces: Activity[];
  /** Top 5 events by score */
  recommendedActivities: Activity[];
  /** All matching activities (with isRecommended flag set per type) */
  all: Activity[];
}

export async function fetchMatchActivities(
  profile: MatchProfile,
): Promise<ActivitiesResult> {
  try {
    const client = createActivitiesClient();

    // Compute month window from matchedOn (format: YYYY-MM-DD)
    const monthStart = profile.matchedOn.slice(0, 7) + "-01";
    const monthEnd = new Date(
      new Date(monthStart).setMonth(new Date(monthStart).getMonth() + 1),
    )
      .toISOString()
      .slice(0, 10);

    const [eventsRes, locationsRes] = await Promise.all([
      client
        .from("events")
        .select(
          "id, title, description, url, organization, location, neighborhood, area, latitude, longitude, categories, age_categories, start_date, end_date, start_time, end_time, day_of_week, repeat_next_date, repeat_rrule, tagline, newsletter_description",
        )
        .eq("postpartum_post", true)
        .neq("status", "new")
        .neq("status", "archived")
        // Include events where:
        //   1. start_date falls within the match month
        //   2. repeat_next_date falls within the match month
        //   3. the match month overlaps the event's start_date–end_date range
        .or(
          `and(start_date.gte.${monthStart},start_date.lt.${monthEnd}),` +
          `and(repeat_next_date.gte.${monthStart},repeat_next_date.lt.${monthEnd}),` +
          `and(start_date.lt.${monthEnd},end_date.gte.${monthStart})`,
        ),

      client
        .from("locations")
        .select("id, name, description, url, address, neighborhood, area, latitude, longitude, age_categories")
        .eq("postpartum_post", true),
    ]);

    if (eventsRes.error) console.error("[activities] events query failed:", eventsRes.error.message);
    if (locationsRes.error) console.error("[activities] locations query failed:", locationsRes.error.message);

    const today = new Date().toISOString().slice(0, 10);
    const rawEvents = ((eventsRes.data ?? []) as RawEvent[]).filter((e) => {
      // Drop events entirely in the past
      const notPast =
        (e.end_date != null && e.end_date >= today) ||
        (e.repeat_next_date != null && e.repeat_next_date >= today) ||
        e.start_date >= today;
      if (!notPast) return false;

      // The effective display date must fall within the match month.
      // For range events (condition 3), use start_date as the anchor instead.
      const displayDate = e.repeat_next_date ?? e.start_date;
      const inMonth = displayDate >= monthStart && displayDate < monthEnd;
      const startInMonth = e.start_date >= monthStart && e.start_date < monthEnd;
      return inMonth || startInMonth;
    });
    const rawLocations = (locationsRes.data ?? []) as RawLocation[];

    const candidates: Omit<Activity, "score" | "isRecommended">[] = [
      ...rawEvents.map((e) => ({
        id: e.id,
        kind: "event" as ActivityKind,
        title: e.title,
        description: e.description,
        url: e.url,
        organization: e.organization,
        location: e.location,
        neighborhood: e.neighborhood,
        area: e.area,
        lat: e.latitude,
        lng: e.longitude,
        categories: e.categories ?? [],
        age_categories: e.age_categories ?? [],
        start_date: e.start_date,
        end_date: e.end_date,
        start_time: e.start_time,
        end_time: e.end_time,
        day_of_week: e.day_of_week,
        repeat_next_date: e.repeat_next_date,
        tagline: e.tagline,
        newsletter_description: e.newsletter_description,
        repeat_rrule: e.repeat_rrule,
      })),
      ...rawLocations.map((l) => ({
        id: l.id,
        kind: "location" as ActivityKind,
        title: l.name,
        description: l.description,
        url: l.url,
        organization: null,
        location: l.address,
        neighborhood: l.neighborhood,
        area: l.area,
        lat: l.latitude,
        lng: l.longitude,
        categories: [] as string[],
        age_categories: l.age_categories ?? [],
      })),
    ];

    // Age-bucket filter
    const pairBuckets = new Set(
      [...profile.member1Children, ...profile.member2Children]
        .map(childAgeBucket)
        .filter((b): b is string => b !== null),
    );
    const ageFiltered = candidates.filter((a) => ageCompatible(a.age_categories, pairBuckets));

    // Score all candidates
    const scored = ageFiltered.map((a) => ({
      ...a,
      score: scoreActivity(a, profile, pairBuckets),
      isRecommended: false,
    }));

    // Split by type and take top 5 within each group independently
    const scoredPlaces = scored
      .filter((a) => a.kind === "location")
      .sort((a, b) => b.score - a.score);

    // For events: prioritize "both can attend" — only fill remaining slots with one-member events
    const m1Set = new Set(profile.member1Days.map((d) => d.toLowerCase()));
    const m2Set = new Set(profile.member2Days.map((d) => d.toLowerCase()));
    const bothCanAttend = (a: typeof scored[number]) => {
      const day = derivedDayOfWeek(a);
      if (!day) return false;
      // Empty days = availability not set → assume free every day
      const m1Free = m1Set.size === 0 || m1Set.has(day);
      const m2Free = m2Set.size === 0 || m2Set.has(day);
      return m1Free && m2Free;
    };

    const scoredActivities = scored
      .filter((a) => a.kind !== "location")
      .sort((a, b) => b.score - a.score);

    const topActivities = scoredActivities.filter((a) => bothCanAttend(a)).slice(0, 5);

    const recPlaceIds = new Set(scoredPlaces.slice(0, 5).map((a) => a.id));
    const recActivityIds = new Set(topActivities.map((a) => a.id));

    const all = [...scoredPlaces, ...scoredActivities].map((a) => ({
      ...a,
      isRecommended: recPlaceIds.has(a.id) || recActivityIds.has(a.id),
    }));

    const recommendedPlaces = all.filter((a) => recPlaceIds.has(a.id));
    const recommendedActivities = all.filter((a) => recActivityIds.has(a.id));

    return { recommendedPlaces, recommendedActivities, all };
  } catch (err) {
    console.error("[activities] fetch failed:", err);
    return { recommendedPlaces: [], recommendedActivities: [], all: [] };
  }
}
