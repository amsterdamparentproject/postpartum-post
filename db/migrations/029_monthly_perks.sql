-- Migration 029: monthly_perks
--
-- "No match, just perks" — a member can opt in to Post Perks access for the
-- month without joining the coffee/playdate matching pool. Deliberately a
-- separate table from monthly_participation rather than a third topic:
-- every matcher-pool query (run-matcher, and the admin preview/test-run
-- sites in app/admin/matches/actions.ts) reads monthly_participation
-- directly with no topic filter, so a "perks" topic row there would need
-- every one of those call sites — present and future — to remember to
-- exclude it. A separate table makes that structurally impossible: the
-- matcher never queries this table, so there's nothing to filter.
--
-- monthly_participation stays "wants to be matched" (its original meaning);
-- monthly_perks means "wants perks without matching." Mirrors monthly_skips
-- in shape (001_monthly_skips.sql) — one row per member per month.

create table postpartumpost.monthly_perks (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references postpartumpost.members(id) on delete cascade,
  month       date not null,     -- always first of month, e.g. 2026-05-01
  created_at  timestamptz not null default now(),
  unique (member_id, month)
);

create index on postpartumpost.monthly_perks (member_id);
create index on postpartumpost.monthly_perks (month);

-- New entitlement event for the credit this choice consumes (see
-- 022_match_ledger.sql). Fired once per member per month from
-- commit-matches, same call site and same one-decrement-per-month unique
-- index (match_entitlements_decrement_month_idx) as match_delivered and
-- no_response, so it can't double-fire alongside either of those even if
-- something upstream mis-scopes a member into both.
alter type postpartumpost.entitlement_event add value 'perks_only';

notify pgrst, 'reload schema';
