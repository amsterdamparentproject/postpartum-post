create schema if not exists postpartumpost;

-- Enums (only for stable, well-defined value sets)
create type postpartumpost.language as enum (
  'english',
  'dutch'
);

create type postpartumpost.member_status as enum (
  'pending',
  'active', -- Paid & filled out match form (or haven't received one yet)
  'paused', -- They don't fill out the match form
  'inactive' -- Unsubscribed, canceled, etc
);

create type postpartumpost.rematch_reason as enum (
  'no_show',
  'scheduling',
  'bad_fit',
  'other'
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
  topic_id uuid references postpartumpost.topics(id) on delete set null,
  language postpartumpost.language, -- null is no preference
  stripe_customer_id text unique,
  status postpartumpost.member_status not null default 'pending',
  consecutive_skips integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table postpartumpost.subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references postpartumpost.members(id) on delete cascade,
  stripe_subscription_id text not null unique,
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
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint no_self_match check (member_id_1 != member_id_2)
);

-- Indexes
create index on postpartumpost.members (topic_id);
create index on postpartumpost.members (stripe_customer_id);
create index on postpartumpost.subscriptions (member_id);
create index on postpartumpost.subscriptions (stripe_subscription_id);
create index on postpartumpost.matches (member_id_1);
create index on postpartumpost.matches (member_id_2);

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