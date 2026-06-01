-- Migration 005: match_rounds and match_drafts tables
-- Introduces a staging layer between running the matcher and committing results to matches.
--
-- match_rounds: one row per monthly matching cycle. Tracks status through the lifecycle:
--   draft     → matcher has run, Alex is reviewing
--   committed → n8n has written drafts to matches (EOD 6th), emails sent
--   locked    → n8n has locked the round (morning of 7th); match_drafts become read-only
--
-- match_drafts: proposed pairs for a round. Alex can reassign these before the round commits.
-- On commit, rows are promoted to postpartumpost.matches. match_drafts are never deleted —
-- they serve as a permanent record of what was proposed vs. what was committed.

create table if not exists postpartumpost.match_rounds (
  id           uuid primary key default gen_random_uuid(),
  month        date not null unique,   -- e.g. 2026-07-01
  status       text not null default 'draft'
                 check (status in ('draft', 'committed', 'locked')),
  round_score  float8,                -- aggregate quality metric (weighted average of pair scores)
  committed_at timestamptz,
  locked_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists postpartumpost.match_drafts (
  id              uuid primary key default gen_random_uuid(),
  round_id        uuid not null references postpartumpost.match_rounds(id) on delete cascade,
  member_id_1     uuid not null references postpartumpost.members(id),
  member_id_2     uuid not null references postpartumpost.members(id),
  score           float8 not null,
  breakdown       jsonb not null,      -- { language, availability, topic, proximity, children }
  match_type      postpartumpost.match_type,
  quality_tier    text check (quality_tier in ('great', 'good', 'needs_work')),
  created_at      timestamptz not null default now(),
  constraint no_self_draft check (member_id_1 != member_id_2)
);

create index if not exists match_rounds_month_idx       on postpartumpost.match_rounds (month);
create index if not exists match_drafts_round_id_idx    on postpartumpost.match_drafts (round_id);
create index if not exists match_drafts_member_id_1_idx on postpartumpost.match_drafts (member_id_1);
create index if not exists match_drafts_member_id_2_idx on postpartumpost.match_drafts (member_id_2);

create trigger set_updated_at_match_rounds
  before update on postpartumpost.match_rounds
  for each row execute function postpartumpost.handle_updated_at();
