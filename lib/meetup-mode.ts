import { haversineKm } from "@/lib/geo-distance";

/**
 * How far apart two matched members can live and still be offered an in-person
 * meetup (straight-line km, inclusive). Beyond it the pair is pointed to a
 * video call. Used by the cohort match page; regular matches are not gated by it.
 */
export const LOCAL_MEETUP_KM = 10;

/**
 * - local:   both locations known and within LOCAL_MEETUP_KM: meet in person
 * - online:  both locations known and farther apart: meet by video
 * - unknown: a location is missing, so the pair decides together
 */
export type MeetupMode = "local" | "online" | "unknown";

type Point = { lat: number | null | undefined; lng: number | null | undefined };

function hasCoords(p: Point): p is { lat: number; lng: number } {
  return Number.isFinite(p.lat) && Number.isFinite(p.lng);
}

export function getMeetupMode(a: Point, b: Point, maxKm: number = LOCAL_MEETUP_KM): MeetupMode {
  if (!hasCoords(a) || !hasCoords(b)) return "unknown";
  return haversineKm(a, b) <= maxKm ? "local" : "online";
}
