-- Migration 010: featured_activities table
-- A standing list of events and resources Alex has curated for the match page.
-- Each row points to either activities.events OR activities.resources (not both).
--
-- Shown on the match page in two scenarios:
--   - Members have coordinates → nearby upcoming events + featured activities
--   - No coordinates          → featured activities only

create table if not exists activities.featured_activities (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid references activities.events(id) on delete cascade,
  resource_id uuid references activities.resources(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (event_id),
  unique (resource_id),
  constraint exactly_one_activity check (
    (event_id is not null and resource_id is null) or
    (event_id is null and resource_id is not null)
  )
);

create index if not exists featured_activities_event_id_idx    on activities.featured_activities (event_id)    where event_id    is not null;
create index if not exists featured_activities_resource_id_idx on activities.featured_activities (resource_id) where resource_id is not null;
