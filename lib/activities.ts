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
 * postpartum_post filter: deferred until column is added — currently includes all.
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
  /** Events only */
  start_date?: string;
  end_date?: string | null;
  start_time?: string | null;
  day_of_week?: string | null;
  repeat_next_date?: string | null;
  tagline?: string | null;
  newsletter_description?: string | null;
  /** Computed */
  score: number;
  isRecommended: boolean;
}

export interface MatchProfile {
  /** Midpoint of the two members' coordinates */
  center: { lat: number; lng: number } | null;
  /** Union of both members' availability days (used for scoring) */
  availabilityDays: string[];
  /** Each member's individual availability days (used for "both can attend" prioritization) */
  member1Days: string[];
  member2Days: string[];
  /** The match's month date (YYYY-MM-DD), used to filter events to this month */
  matchedOn: string;
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
  availability: 0.6,
  distance: 0.4,
};

function scoreActivity(
  activity: Omit<Activity, "score" | "isRecommended">,
  profile: MatchProfile,
): number {
  const avail = availabilityScore(
    profile.availabilityDays,
    activity.day_of_week,
  );
  const dist = profile.center
    ? distanceScore(profile.center, activity.lat, activity.lng)
    : 0.5;

  return WEIGHTS.availability * avail + WEIGHTS.distance * dist;
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
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  day_of_week: string | null;
  repeat_next_date: string | null;
  tagline: string | null;
  newsletter_description: string | null;
};

type RawLocation = {
  id: string;
  name: string;
  address: string | null;
  neighborhood: string | null;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
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
          "id, title, description, url, organization, location, neighborhood, area, latitude, longitude, categories, start_date, end_date, start_time, day_of_week, repeat_next_date, tagline, newsletter_description",
        )
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
        .select("id, name, address, neighborhood, area, latitude, longitude"),
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
        start_date: e.start_date,
        end_date: e.end_date,
        start_time: e.start_time,
        day_of_week: e.day_of_week,
        repeat_next_date: e.repeat_next_date,
        tagline: e.tagline,
        newsletter_description: e.newsletter_description,
      })),
      ...rawLocations.map((l) => ({
        id: l.id,
        kind: "location" as ActivityKind,
        title: l.name,
        description: null,
        url: null,
        organization: null,
        location: l.address,
        neighborhood: l.neighborhood,
        area: l.area,
        lat: l.latitude,
        lng: l.longitude,
        categories: [] as string[],
      })),
    ];

    // Score all candidates
    const scored = candidates.map((a) => ({
      ...a,
      score: scoreActivity(a, profile),
      isRecommended: false,
    }));

    // Split by type and take top 5 within each group independently
    const scoredPlaces = scored
      .filter((a) => a.kind === "location")
      .sort((a, b) => b.score - a.score);

    // For events: prioritize "both can attend" — only fill remaining slots with one-member events
    const m1Set = new Set(profile.member1Days.map((d) => d.toLowerCase()));
    const m2Set = new Set(profile.member2Days.map((d) => d.toLowerCase()));
    const bothCanAttend = (day: string | null | undefined) => {
      if (!day) return false;
      const d = day.toLowerCase();
      return m1Set.has(d) && m2Set.has(d);
    };

    const scoredActivities = scored
      .filter((a) => a.kind !== "location")
      .sort((a, b) => b.score - a.score);

    const bothEvents = scoredActivities.filter((a) => bothCanAttend(a.day_of_week));
    const oneEvents  = scoredActivities.filter((a) => !bothCanAttend(a.day_of_week));
    const topActivities = [
      ...bothEvents.slice(0, 5),
      ...oneEvents.slice(0, Math.max(0, 5 - bothEvents.length)),
    ];

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
