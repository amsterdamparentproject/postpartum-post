create schema if not exists postpartumpost;

-- Enums (only for stable, well-defined value sets)
-- Note: language is intentionally NOT an enum — it is stored as text[]
-- so members can indicate multiple languages. See migrations/003_language_array.sql.

create type postpartumpost.member_status as enum (
  'pending',
  'active', -- Paid & filled out match form (or haven't received one yet)
  'paused', -- They don't fill out the match form
  'inactive' -- Unsubscribed, canceled, etc
);

create type postpartumpost.rematch_reason as enum (
  'no_response',
  'not_a_good_fit',
  'safety_concern',  -- routes to safety report flow, not normal rematch pool
  'harassment',      -- routes to safety report flow, not normal rematch pool
  'other'
);

create type postpartumpost.parent_type as enum (
  'mom',   -- open to meeting moms
  'dad',   -- open to meeting dads
  'anyone' -- no preference
);

-- Maps to Stripe statuses
create type postpartumpost.subscription_status as enum (
  'active',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'past_due',
  'trialing',
  'unpaid'
);

-- Topics: table is the source of truth, no enum needed
create table postpartumpost.topics (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  postcard_image_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table postpartumpost.members (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null unique,
  zipcode text,
  lat float8,                        -- geocoded from zipcode (cached, see migrations/002)
  lng float8,
  language text[],                   -- languages member is comfortable matching in; null = no preference
  stripe_customer_id text unique,
  status postpartumpost.member_status not null default 'pending',
  consecutive_skips integer not null default 0,
  open_to_second_match boolean not null default true, -- willing to match twice in a month (tiebreaker + rematch pool)
  parent_type postpartumpost.parent_type not null default 'anyone', -- who you're open to meeting
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  availability jsonb,
  match_priority text check (match_priority in ('age', 'proximity')),
  children jsonb -- array of { birth_month, birth_year, expected }
);

create table postpartumpost.subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references postpartumpost.members(id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_price_id text,
  status postpartumpost.subscription_status not null default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table postpartumpost.matches (
  id uuid primary key default gen_random_uuid(),
  member_id_1 uuid not null references postpartumpost.members(id) on delete cascade,
  member_id_2 uuid not null references postpartumpost.members(id) on delete cascade,
  matched_on date not null default current_date,
  rematch_requested boolean not null default false,
  rematch_reason postpartumpost.rematch_reason,
  rematch_requested_at timestamptz,
  rematch_requested_by uuid references postpartumpost.members(id) on delete set null,
  flagged_for_review boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint no_self_match check (member_id_1 != member_id_2)
);

create view postpartumpost.rematches as
select
  id                   as match_id,
  member_id_1,
  member_id_2,
  matched_on,
  rematch_reason       as reason,
  rematch_requested_at as requested_at,
  rematch_requested_by as requested_by,
  flagged_for_review
from postpartumpost.matches
where rematch_requested = true;

-- Monthly participation: one row per member per calendar month they opted in.
-- Only members with a row here are included in the match run on the 5th.
-- Members who neither skip nor participate are silently excluded (no subscription extension).
create table postpartumpost.monthly_participation (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references postpartumpost.members(id) on delete cascade,
  month       date not null,        -- always first of month, e.g. 2026-07-01
  topic_id    uuid not null references postpartumpost.topics(id),  -- coffee or playdate
  opted_in_at timestamptz not null default now(),
  unique (member_id, month)
);

-- Monthly skips: one row per member per calendar month they opted out.
-- consecutive_skips on members is a cached counter; this table is the source of truth.
create table postpartumpost.monthly_skips (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references postpartumpost.members(id) on delete cascade,
  month       date not null,     -- always first of month, e.g. 2026-05-01
  created_at  timestamptz not null default now(),
  unique (member_id, month)
);

-- Match rounds: one row per monthly matching cycle.
-- status: draft → committed (EOD 6th, n8n) → locked (morning 7th, n8n)
create table postpartumpost.match_rounds (
  id           uuid primary key default gen_random_uuid(),
  month        date not null unique,
  status       text not null default 'draft'
                 check (status in ('draft', 'committed', 'locked')),
  round_score  float8,
  committed_at timestamptz,
  locked_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Match drafts: proposed pairs for a round. Alex can reassign before EOD 6th.
-- On commit, promoted to postpartumpost.matches. Never deleted — permanent record
-- of what was proposed vs. committed.
create table postpartumpost.match_drafts (
  id              uuid primary key default gen_random_uuid(),
  round_id        uuid not null references postpartumpost.match_rounds(id) on delete cascade,
  member_id_1     uuid not null references postpartumpost.members(id),
  member_id_2     uuid not null references postpartumpost.members(id),
  score           float8 not null,
  breakdown       jsonb not null,      -- { language, availability, topic, proximity, children }
  quality_tier    text check (quality_tier in ('great', 'good', 'needs_work')),
  created_at      timestamptz not null default now(),
  constraint no_self_draft check (member_id_1 != member_id_2)
);

-- Indexes
create index on postpartumpost.members (lat, lng) where lat is not null and lng is not null;
create index on postpartumpost.members (stripe_customer_id);
create index on postpartumpost.subscriptions (member_id);
create index on postpartumpost.subscriptions (stripe_subscription_id);
create index on postpartumpost.matches (member_id_1);
create index on postpartumpost.matches (member_id_2);
create index on postpartumpost.monthly_skips (member_id);
create index on postpartumpost.monthly_skips (month);
create index on postpartumpost.monthly_participation (member_id);
create index on postpartumpost.monthly_participation (month);
create index on postpartumpost.monthly_participation (topic_id);
create index on postpartumpost.match_rounds (month);
create index on postpartumpost.match_drafts (round_id);
create index on postpartumpost.match_drafts (member_id_1);
create index on postpartumpost.match_drafts (member_id_2);
create index on postpartumpost.matches (flagged_for_review) where flagged_for_review = true;

-- Seed data
insert into postpartumpost.topics (name) values ('coffee'), ('playdate');

-- Updated_at trigger
create or replace function postpartumpost.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at_members
  before update on postpartumpost.members
  for each row execute function postpartumpost.handle_updated_at();

create trigger set_updated_at_subscriptions
  before update on postpartumpost.subscriptions
  for each row execute function postpartumpost.handle_updated_at();

create trigger set_updated_at_matches
  before update on postpartumpost.matches
  for each row execute function postpartumpost.handle_updated_at();

create trigger set_updated_at_topics
  before update on postpartumpost.topics
  for each row execute function postpartumpost.handle_updated_at();

create trigger set_updated_at_match_rounds
  before update on postpartumpost.match_rounds
  for each row execute function postpartumpost.handle_updated_at();