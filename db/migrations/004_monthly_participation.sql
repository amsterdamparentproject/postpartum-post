-- Migration 004: monthly_participation table
-- Tracks members who have opted into matching for a given month.
-- Only members with a row here are included in the match run on the 5th.
-- Distinct from monthly_skips: skipping is explicit opt-out; this is explicit opt-in.
-- Members who neither skip nor participate are silently excluded — no subscription extension.
--
-- match_type here is the per-month preference (coffee or playdate) and overrides
-- the standing match_type on the members table for that round.

create table if not exists postpartumpost.monthly_participation (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references postpartumpost.members(id) on delete cascade,
  month       date not null,        -- always first of month, e.g. 2026-07-01
  match_type  postpartumpost.match_type not null,  -- 'in_person' (coffee/playdate) or 'online'
  opted_in_at timestamptz not null default now(),
  unique (member_id, month)
);

create index if not exists monthly_participation_member_id_idx on postpartumpost.monthly_participation (member_id);
create index if not exists monthly_participation_month_idx     on postpartumpost.monthly_participation (month);
