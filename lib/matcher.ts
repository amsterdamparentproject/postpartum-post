/**
 * Postpartum Post — Monthly Matching Algorithm
 *
 * Pairs active members by compatibility score. Field rank (highest → lowest):
 *   language → availability → topic → (proximity | children, ordered by match_priority)
 *
 * Scoring rules:
 *   - A field is only scored when BOTH members have a preference set.
 *   - null / unset means "no preference" → no bonus, no penalty.
 *   - parent_type is a preference: mismatches score 0 but are never excluded.
 *   - No re-match within 6 months.
 *
 * Matching strategy: greedy O(n²) — sort all valid scored pairs by score
 * descending, then assign each member to their highest-scoring available partner.
 */

import { ENABLE_TIME_OF_DAY } from "@/lib/flags";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = import("@supabase/supabase-js").SupabaseClient<any, any, any>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MatchCandidate {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  zipcode: string | null;
  lat: number | null;
  lng: number | null;
  topic_id: string | null;
  language: string[] | null;
  parent_type: "mom" | "dad" | "anyone" | null;
  availability: { days: string[]; times: string[] } | null;
  match_priority: "age" | "proximity" | null;
  children: { birth_month: number; birth_year: number; expected: boolean }[] | null;
  /** When true, this member can be paired twice in a month (odd-pool tiebreaker or rematch). */
  open_to_second_match?: boolean;
}

export interface ScoreBreakdown {
  language: number;
  parent_type: number;
  availability: number;
  topic: number;
  proximity: number;
  children: number;
  total: number;
}

export interface ScoredPair {
  a: MatchCandidate;
  b: MatchCandidate;
  score: number;
  breakdown: ScoreBreakdown;
}

export interface MatcherResult {
  matched: ScoredPair[];
  unmatched: MatchCandidate[];
  /** Member paired twice to absorb an odd-pool leftover. Undefined when pool is even. */
  doubleMatchedId?: string;
}

// ---------------------------------------------------------------------------
// Scoring weights — each tier's max is larger than the sum of all tiers below
// it, so a match in a higher-ranked field always outweighs any combination of
// lower-ranked field matches.
// ---------------------------------------------------------------------------

const W = {
  LANGUAGE: 1_000,
  PARENT_TYPE: 1_000,
  AVAILABILITY: 500,
  TOPIC: 250,
  // proximity + children combined = 150; split depends on match_priority
  PRIORITY_HIGH: 100,
  PRIORITY_LOW: 50,
} as const;

const MAX_PROXIMITY_KM = 15; // beyond this, proximity score = 0
const MAX_CHILD_AGE_GAP_MONTHS = 24; // beyond this, age score = 0

// ---------------------------------------------------------------------------
// Geocoding — OpenStreetMap Nominatim
// ---------------------------------------------------------------------------

interface GeoCoord {
  lat: number;
  lng: number;
}

/** Geocode a Dutch postal code via Nominatim. Returns null on failure. */
async function geocodeZipcode(zipcode: string): Promise<GeoCoord | null> {
  // Normalise: strip spaces, take first 6 chars ("1234AB" or "1234 AB")
  const normalised = zipcode.replace(/\s+/g, "").slice(0, 6);
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("postalcode", normalised);
  url.searchParams.set("countrycodes", "NL");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "PostpartumPost/1.0 (amsterdamparentproject@gmail.com)",
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

function haversineKm(a: GeoCoord, b: GeoCoord): number {
  const R = 6_371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinLng * sinLng;
  return R * 2 * Math.asin(Math.sqrt(h));
}

/** Sleep helper for Nominatim rate-limit compliance (1 req/sec). */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Geocode all members that have a zipcode but no cached lat/lng.
 * Updates the members table so subsequent runs use cached values.
 * Returns a coord map keyed by member id.
 */
export async function geocodeMembers(
  members: MatchCandidate[],
  supabase: AnySupabaseClient
): Promise<Map<string, GeoCoord>> {
  const coordMap = new Map<string, GeoCoord>();
  const zipToCoord = new Map<string, GeoCoord | null>();

  // Seed from already-cached values
  for (const m of members) {
    if (m.lat != null && m.lng != null) {
      coordMap.set(m.id, { lat: m.lat, lng: m.lng });
      if (m.zipcode) zipToCoord.set(m.zipcode, { lat: m.lat, lng: m.lng });
    }
  }

  // Collect zipcodes that need geocoding
  const toGeocode = members.filter(
    (m) => m.zipcode && (m.lat == null || m.lng == null)
  );
  const uniqueZipcodes = [
    ...new Set(toGeocode.map((m) => m.zipcode!)),
  ].filter((z) => !zipToCoord.has(z));

  // Geocode sequentially to stay within Nominatim 1 req/sec limit
  for (let i = 0; i < uniqueZipcodes.length; i++) {
    const z = uniqueZipcodes[i];
    const coord = await geocodeZipcode(z);
    zipToCoord.set(z, coord);
    if (i < uniqueZipcodes.length - 1) await sleep(1_100);
  }

  // Persist new results and populate coordMap
  const updates: Array<{ id: string; lat: number; lng: number }> = [];
  for (const m of toGeocode) {
    const coord = m.zipcode ? zipToCoord.get(m.zipcode) ?? null : null;
    if (coord) {
      coordMap.set(m.id, coord);
      updates.push({ id: m.id, lat: coord.lat, lng: coord.lng });
    }
  }

  if (updates.length) {
    // Upsert in one shot — Supabase doesn't support bulk updates natively,
    // so we fire individual updates in parallel (safe; each touches one row).
    await Promise.all(
      updates.map(({ id, lat, lng }) =>
        supabase.from("members").update({ lat, lng }).eq("id", id)
      )
    );
  }

  return coordMap;
}

// ---------------------------------------------------------------------------
// Individual field scorers (return raw 0–1 unless otherwise noted)
// ---------------------------------------------------------------------------

/**
 * parent_type is a preference, not a hard constraint — all combinations are
 * compatible for matching. Mismatches are reflected in the score (0 pts) and
 * shown as red in the admin UI, but never excluded.
 */
export function parentTypeCompatible(
  _a: MatchCandidate,
  _b: MatchCandidate
): boolean {
  return true;
}

/**
 * Returns W.PARENT_TYPE or 0.
 * Scores 1000 when both members share the same non-anyone parent_type.
 * null / 'anyone' = no preference → no bonus, no penalty.
 */
function scoreParentType(a: MatchCandidate, b: MatchCandidate): number {
  if (!a.parent_type || !b.parent_type) return 0;
  // "anyone" is an explicit preference, not "no preference" —
  // award the bonus when both preferences match (including both "anyone").
  // One-sided "anyone" gets no bonus (compatible, but not a shared preference).
  if (a.parent_type === b.parent_type) return W.PARENT_TYPE;
  return 0;
}

/** Returns WEIGHTS.LANGUAGE or 0.
 *  Scores 1000 when the two members share at least one language in common.
 *  An empty array or null counts as "no preference" — no bonus, no penalty.
 */
function scoreLanguage(a: MatchCandidate, b: MatchCandidate): number {
  if (!a.language?.length || !b.language?.length) return 0;
  const setB = new Set(b.language);
  return a.language.some((lang) => setB.has(lang)) ? W.LANGUAGE : 0;
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 1; // both empty = no constraints = perfect
  const setA = new Set(a);
  const setB = new Set(b);
  const intersect = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : intersect / union;
}

/** Returns 0–WEIGHTS.AVAILABILITY. */
function scoreAvailability(a: MatchCandidate, b: MatchCandidate): number {
  if (!a.availability || !b.availability) return 0;
  const dayScore = jaccardSimilarity(a.availability.days, b.availability.days);
  if (!ENABLE_TIME_OF_DAY) return dayScore * W.AVAILABILITY;
  const timeScore = jaccardSimilarity(
    a.availability.times,
    b.availability.times
  );
  return ((dayScore + timeScore) / 2) * W.AVAILABILITY;
}

/** Returns WEIGHTS.TOPIC or 0. */
function scoreTopic(a: MatchCandidate, b: MatchCandidate): number {
  if (!a.topic_id || !b.topic_id) return 0;
  return a.topic_id === b.topic_id ? W.TOPIC : 0;
}

/** Returns 0–1. */
function rawProximityScore(
  a: MatchCandidate,
  b: MatchCandidate,
  coordMap: Map<string, GeoCoord>
): number {
  if (!a.zipcode || !b.zipcode) return 0;
  const geoA = coordMap.get(a.id);
  const geoB = coordMap.get(b.id);
  if (!geoA || !geoB) return 0;
  const dist = haversineKm(geoA, geoB);
  return Math.max(0, 1 - dist / MAX_PROXIMITY_KM);
}

/** Returns 0–1. Finds the closest age-matched child across all child pairs. */
function rawChildrenScore(a: MatchCandidate, b: MatchCandidate): number {
  if (!a.children?.length || !b.children?.length) return 0;

  const now = new Date();

  function ageInMonths(c: {
    birth_month: number;
    birth_year: number;
    expected: boolean;
  }): number {
    // For expected children, birth_month/birth_year is the due date.
    // Computing age from it yields a negative number (e.g. due in 2 months → −2),
    // which ranks closer due dates as more similar to each other and to newborns.
    const birthDate = new Date(c.birth_year, c.birth_month - 1, 1);
    const diffMs = now.getTime() - birthDate.getTime();
    return Math.floor(diffMs / (1_000 * 60 * 60 * 24 * 30.44));
  }

  const agesA = a.children.map(ageInMonths);
  const agesB = b.children.map(ageInMonths);

  let minGap = Infinity;
  for (const aa of agesA) {
    for (const ab of agesB) {
      minGap = Math.min(minGap, Math.abs(aa - ab));
    }
  }

  return Math.max(0, 1 - minGap / MAX_CHILD_AGE_GAP_MONTHS);
}

// ---------------------------------------------------------------------------
// Pair scorer
// ---------------------------------------------------------------------------

/**
 * Determines the effective weights for proximity and children given the two
 * members' individual match_priority preferences.
 *
 * Both 'proximity' → proximity gets PRIMARY weight, children gets SECONDARY.
 * Both 'age'       → children gets PRIMARY, proximity gets SECONDARY.
 * Mixed / null     → both share equal weight at mid-point.
 */
function priorityWeights(
  a: MatchCandidate,
  b: MatchCandidate
): { proximityW: number; childrenW: number } {
  const mid = (W.PRIORITY_HIGH + W.PRIORITY_LOW) / 2;

  if (a.match_priority === "proximity" && b.match_priority === "proximity") {
    return { proximityW: W.PRIORITY_HIGH, childrenW: W.PRIORITY_LOW };
  }
  if (a.match_priority === "age" && b.match_priority === "age") {
    return { proximityW: W.PRIORITY_LOW, childrenW: W.PRIORITY_HIGH };
  }
  // One or both null, or conflicting → neutral
  return { proximityW: mid, childrenW: mid };
}

/**
 * Returns the maximum score this specific pair could achieve, counting only
 * fields where both members have data. Used to normalise quality tier so a
 * pair that matches on everything they provided is never penalised for fields
 * they left blank.
 */
export function maxAchievableScore(
  a: MatchCandidate,
  b: MatchCandidate,
  coordMap: Map<string, GeoCoord>
): number {
  let max = 0;
  if (a.language?.length && b.language?.length) max += W.LANGUAGE;
  // Only count parent_type toward max when both share the same value.
  // A specific preference (mom/dad) against "anyone" is unconfirmed — not a bonus.
  if (a.parent_type && b.parent_type && a.parent_type === b.parent_type) max += W.PARENT_TYPE;
  if (a.availability && b.availability) max += W.AVAILABILITY;
  if (a.topic_id && b.topic_id) max += W.TOPIC;
  const { proximityW, childrenW } = priorityWeights(a, b);
  if (coordMap.get(a.id) && coordMap.get(b.id)) max += proximityW;
  if (a.children?.length && b.children?.length) max += childrenW;
  return max;
}

/**
 * Quality tier based on percentage of max achievable score:
 *   ≥ 80% → great  |  ≥ 40% → good  |  < 40% → needs_work
 * Falls back to needs_work when neither member has filled in any scoreable field.
 */
export function qualityTier(
  score: number,
  maxScore: number
): "great" | "good" | "needs_work" {
  if (maxScore === 0) return "needs_work";
  const pct = score / maxScore;
  if (pct >= 0.8) return "great";
  if (pct >= 0.4) return "good";
  return "needs_work";
}

export function scorePair(
  a: MatchCandidate,
  b: MatchCandidate,
  coordMap: Map<string, GeoCoord>
): ScoredPair {
  const language = scoreLanguage(a, b);
  const parent_type = scoreParentType(a, b);
  const availability = scoreAvailability(a, b);
  const topic = scoreTopic(a, b);

  const { proximityW, childrenW } = priorityWeights(a, b);
  const proximity = rawProximityScore(a, b, coordMap) * proximityW;
  const children = rawChildrenScore(a, b) * childrenW;

  const total = language + parent_type + availability + topic + proximity + children;

  return {
    a,
    b,
    score: total,
    breakdown: { language, parent_type, availability, topic, proximity, children, total },
  };
}

// ---------------------------------------------------------------------------
// 6-month repeat-match exclusion
// ---------------------------------------------------------------------------

/**
 * Returns a Set of pair keys ("id1:id2" with id1 < id2) for any pair that
 * has been matched within the last 6 months.
 */
export async function getRecentlyMatchedPairs(
  supabase: AnySupabaseClient
): Promise<Set<string>> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const { data, error } = await supabase
    .from("matches")
    .select("member_id_1, member_id_2")
    .gte("matched_on", sixMonthsAgo.toISOString().split("T")[0]);

  if (error) {
    console.error("[matcher] Failed to fetch recent matches:", error);
    return new Set();
  }

  const pairs = new Set<string>();
  for (const row of data ?? []) {
    const key = [row.member_id_1, row.member_id_2].sort().join(":");
    pairs.add(key);
  }
  return pairs;
}

function pairKey(a: MatchCandidate, b: MatchCandidate): string {
  return [a.id, b.id].sort().join(":");
}

// ---------------------------------------------------------------------------
// Greedy pairing
// ---------------------------------------------------------------------------

function greedyPair(
  scoredPairs: ScoredPair[],
  recentPairs: Set<string>
): { matched: ScoredPair[]; unmatched: MatchCandidate[] } {
  // Filter out incompatible or recently-matched pairs
  const valid = scoredPairs.filter(
    (p) =>
      parentTypeCompatible(p.a, p.b) && !recentPairs.has(pairKey(p.a, p.b))
  );

  // Sort descending by score
  valid.sort((x, y) => y.score - x.score);

  const matched: ScoredPair[] = [];
  const matchedIds = new Set<string>();

  for (const pair of valid) {
    if (!matchedIds.has(pair.a.id) && !matchedIds.has(pair.b.id)) {
      matched.push(pair);
      matchedIds.add(pair.a.id);
      matchedIds.add(pair.b.id);
    }
  }

  // Collect all members to find unmatched ones
  const allMembers = new Map<string, MatchCandidate>();
  for (const p of scoredPairs) {
    allMembers.set(p.a.id, p.a);
    allMembers.set(p.b.id, p.b);
  }

  const unmatched = [...allMembers.values()].filter(
    (m) => !matchedIds.has(m.id)
  );

  return { matched, unmatched };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run the matcher against the provided active member list.
 *
 * @param members  Active members fetched from the DB (with lat/lng already populated).
 * @param supabase Admin client (used only to look up recent matches).
 */
export async function runMatcher(
  members: MatchCandidate[],
  supabase: AnySupabaseClient,
  coordMap: Map<string, GeoCoord>
): Promise<MatcherResult> {
  if (members.length < 2) {
    return { matched: [], unmatched: members };
  }

  const recentPairs = await getRecentlyMatchedPairs(supabase);

  // Generate and score all unique pairs — never pair a member with themselves
  const scoredPairs: ScoredPair[] = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      if (members[i].id === members[j].id) continue;
      scoredPairs.push(scorePair(members[i], members[j], coordMap));
    }
  }

  const result: MatcherResult = greedyPair(scoredPairs, recentPairs);

  // ---------------------------------------------------------------------------
  // Odd-pool resolution: if exactly one member is unmatched, find the best
  // open_to_second_match = true candidate from the matched pool and pair them
  // twice. Pick the willing member whose score against the leftover is highest.
  // ---------------------------------------------------------------------------
  if (result.unmatched.length === 1) {
    const leftover = result.unmatched[0];

    // Gather all matched members willing to take a second match
    const willing = result.matched
      .flatMap((p) => [p.a, p.b])
      .filter((m) => m.open_to_second_match === true);

    if (willing.length > 0) {
      // Score each willing member against the leftover; pick the highest
      const best = willing
        .map((m) => ({ member: m, pair: scorePair(m, leftover, coordMap) }))
        .filter(({ member }) => member.id !== leftover.id)
        .filter(({ pair }) => parentTypeCompatible(pair.a, pair.b))
        .sort((x, y) => y.pair.score - x.pair.score)[0];

      if (best) {
        result.matched.push(best.pair);
        result.unmatched = [];
        result.doubleMatchedId = best.member.id;
      }
    }
  }

  return result;
}
