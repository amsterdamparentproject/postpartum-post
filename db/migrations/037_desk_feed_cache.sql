-- Migration 037: desk_feed_cache
--
-- Last good response from Desk's GET /api/post/activities, one row per month
-- window. lib/desk-feed.ts serves a row younger than the TTL as-is, refreshes
-- it from Desk otherwise, and falls back to the stale row if Desk is down, so a
-- Desk outage only matters when it overlaps a cold cache.
-- Written and read by the service role only.

create table if not exists postpartumpost.desk_feed_cache (
  window_key  text primary key,          -- 'YYYY-MM-DD..YYYY-MM-DD'
  payload     jsonb not null,            -- { events: [...], locations: [...] }
  fetched_at  timestamptz not null default now()
);

alter table postpartumpost.desk_feed_cache enable row level security;
