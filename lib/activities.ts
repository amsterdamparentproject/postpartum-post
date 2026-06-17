/**
 * lib/activities.ts
 *
 * Fetches and scores activities from three tables in the `activities` schema:
 *   - events    (dated, have day_of_week for availability matching)
 *   - resources (undated curated content)
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

export type ActivityKind = "event" | "resource" | "location";

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
  start_time?: string | null;
  day_of_week?: string | null;
  repeat_next_date?: string | null;
  tagline?: string | null;
  /** Computed */
  score: number;
  isRecommended: boolean;
}

export interface MatchProfile {
  /** Midpoint of the two members' coordinates */
  center: { lat: number; lng: number } | null;
  /** Union of both members' availability days */
  availabilityDays: string[];
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
  start_time: string | null;
  day_of_week: string | null;
  repeat_next_date: string | null;
  tagline: string | null;
};

type RawResource = {
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
  /** Top 5 by score */
  recommended: Activity[];
  /** All matching activities (with isRecommended flag set) */
  all: Activity[];
}

export async function fetchMatchActivities(
  profile: MatchProfile,
): Promise<ActivitiesResult> {
  try {
    const client = createActivitiesClient();
    const today = new Date().toISOString().slice(0, 10);

    const [eventsRes, resourcesRes, locationsRes] = await Promise.all([
      client
        .from("events")
        .select(
          "id, title, description, url, organization, location, neighborhood, area, latitude, longitude, categories, start_date, start_time, day_of_week, repeat_next_date, tagline",
        )
        .eq("status", "edited")
        .or(`start_date.gte.${today},repeat_next_date.gte.${today}`),

      client
        .from("resources")
        .select(
          "id, title, description, url, organization, location, neighborhood, area, latitude, longitude, categories",
        )
        .eq("status", "edited"),

      client
        .from("locations")
        .select("id, name, address, neighborhood, area, latitude, longitude"),
    ]);

    if (eventsRes.error) console.error("[activities] events query failed:", eventsRes.error.message);
    if (resourcesRes.error) console.error("[activities] resources query failed:", resourcesRes.error.message);
    if (locationsRes.error) console.error("[activities] locations query failed:", locationsRes.error.message);

    const rawEvents = (eventsRes.data ?? []) as RawEvent[];
    const rawResources = (resourcesRes.data ?? []) as RawResource[];
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
        start_time: e.start_time,
        day_of_week: e.day_of_week,
        repeat_next_date: e.repeat_next_date,
        tagline: e.tagline,
      })),
      ...rawResources.map((r) => ({
        id: r.id,
        kind: "resource" as ActivityKind,
        title: r.title,
        description: r.description,
        url: r.url,
        organization: r.organization,
        location: r.location,
        neighborhood: r.neighborhood,
        area: r.area,
        lat: r.latitude,
        lng: r.longitude,
        categories: r.categories ?? [],
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
    const scored: Activity[] = candidates
      .map((a) => ({ ...a, score: scoreActivity(a, profile), isRecommended: false }))
      .sort((a, b) => b.score - a.score);

    // Top 5 are recommended
    const recommendedIds = new Set(scored.slice(0, 5).map((a) => a.id));
    const all = scored.map((a) => ({
      ...a,
      isRecommended: recommendedIds.has(a.id),
    }));
    const recommended = all.slice(0, 5);

    return { recommended, all };
  } catch (err) {
    console.error("[activities] fetch failed:", err);
    return { recommended: [], all: [] };
  }
}
