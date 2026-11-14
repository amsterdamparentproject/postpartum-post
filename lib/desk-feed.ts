/**
 * lib/desk-feed.ts
 *
 * Client for Desk's GET /api/post/activities feed, with a cache that
 * survives Desk outages.
 *
 *   fresh row (< TTL)   -> serve it
 *   otherwise           -> fetch Desk (3s timeout), upsert, serve
 *   Desk fails          -> serve the last good row however old
 *   cold cache + failure -> null (callers show no activities and we log)
 *
 * The short TTL means an event added in Desk shows up on the next match-page
 * visit within a few minutes. Availability is not sent to Desk: the cached
 * month holds every occurrence and callers apply availability locally.
 */
import { createAdminClient } from "@/lib/supabase";

export const DESK_FEED_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;
const PATH = "/api/post/activities";

export interface DeskEvent {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  organization: string | null;
  location: string | null;
  neighborhood: string | null;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
  categories: string[];
  age_categories: string[];
  tagline: string | null;
  newsletter_description: string | null;
  recurring: boolean;
  repeat_rrule: string | null;
  /** One row per occurrence: YYYY-MM-DD, weekday name, that day's times. */
  date: string;
  weekday: string;
  start_time: string | null;
  end_time: string | null;
}

export interface DeskLocation {
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
}

export interface DeskFeed {
  events: DeskEvent[];
  locations: DeskLocation[];
}

async function fetchFromDesk(from: string, to: string): Promise<DeskFeed> {
  const base = process.env.DESK_API_URL;
  const secret = process.env.POST_DESK_SECRET;
  if (!base || !secret) throw new Error("DESK_API_URL / POST_DESK_SECRET not configured");

  const subject = `${PATH}?from=${from}&to=${to}`;
  const res = await fetch(new URL(subject, base), {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Desk responded ${res.status}`);
  const body = (await res.json()) as Partial<DeskFeed>;
  if (!Array.isArray(body.events) || !Array.isArray(body.locations)) {
    throw new Error("Desk response malformed");
  }
  return { events: body.events, locations: body.locations };
}

/** Cache + fetch seams, injectable for tests. */
export interface FeedDeps {
  read: (key: string) => Promise<{ payload: DeskFeed; fetchedAt: number } | null>;
  write: (key: string, payload: DeskFeed) => Promise<void>;
  fetchDesk: (from: string, to: string) => Promise<DeskFeed>;
  now: () => number;
}

const defaultDeps: FeedDeps = {
  async read(key) {
    const { data } = await createAdminClient()
      .from("desk_feed_cache")
      .select("payload, fetched_at")
      .eq("window_key", key)
      .maybeSingle();
    return data
      ? { payload: data.payload as DeskFeed, fetchedAt: Date.parse(data.fetched_at) }
      : null;
  },
  async write(key, payload) {
    const { error } = await createAdminClient()
      .from("desk_feed_cache")
      .upsert({ window_key: key, payload, fetched_at: new Date().toISOString() });
    if (error) console.error("[desk-feed] cache write failed:", error.message);
  },
  fetchDesk: fetchFromDesk,
  now: () => Date.now(),
};

export async function getDeskFeed(
  from: string,
  to: string,
  deps: FeedDeps = defaultDeps,
): Promise<DeskFeed | null> {
  const key = `${from}..${to}`;
  let cached: Awaited<ReturnType<FeedDeps["read"]>> = null;
  try {
    cached = await deps.read(key);
  } catch (err) {
    console.error("[desk-feed] cache read failed:", err);
  }
  if (cached && deps.now() - cached.fetchedAt < DESK_FEED_TTL_MS) return cached.payload;

  try {
    const fresh = await deps.fetchDesk(from, to);
    await deps.write(key, fresh).catch((e) => console.error("[desk-feed] cache write failed:", e));
    return fresh;
  } catch (err) {
    console.error("[desk-feed] Desk fetch failed:", err);
    if (cached) return cached.payload;
    console.error(`[desk-feed] cold cache and Desk unavailable for ${key}`);
    return null;
  }
}
