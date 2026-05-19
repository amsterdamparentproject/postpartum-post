-- Migration 001: monthly_skips table
-- Run this against an existing database. The main schema (postpartumpost.sql)
-- should be kept in sync with these migrations.
--
-- monthly_skips: one row per member per calendar month they opted out.
-- The matching algorithm on the 5th excludes any member with a row here
-- for the current month. consecutive_skips on members is a cached counter
-- derived from this table — always derivable from it if it ever drifts.

create table if not exists postpartumpost.monthly_skips (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references postpartumpost.members(id) on delete cascade,
  month       date not null,     -- always store as first of month, e.g. 2026-05-01
  created_at  timestamptz not null default now(),
  unique (member_id, month)
);

create index if not exists monthly_skips_member_id_idx on postpartumpost.monthly_skips (member_id);
create index if not exists monthly_skips_month_idx     on postpartumpost.monthly_skips (month);
