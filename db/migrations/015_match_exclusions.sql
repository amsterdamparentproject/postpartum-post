-- Migration 015: match_exclusions
--
-- Permanent "never match these two" list. Unlike the 6-month repeat-match
-- window in the matcher, exclusions here never expire.
--
-- Populated by members via the /matches UI (e.g. couples who both sign up)
-- or manually by admins following a safety decision.
--
-- Access: service role only — never exposed to the anon key.

create table if not exists postpartumpost.match_exclusions (
  id          uuid primary key default gen_random_uuid(),
  member_id_1 uuid not null references postpartumpost.members(id) on delete cascade,
  member_id_2 uuid not null references postpartumpost.members(id) on delete cascade,
  reason      text,
  created_by  text,  -- e.g. 'member_request', 'admin'
  created_at  timestamptz not null default now(),
  constraint no_self_exclusion check (member_id_1 <> member_id_2)
);

-- One row per pair, order-independent.
create unique index if not exists match_exclusions_pair_idx
  on postpartumpost.match_exclusions (
    least(member_id_1, member_id_2),
    greatest(member_id_1, member_id_2)
  );

create index if not exists match_exclusions_member_1_idx
  on postpartumpost.match_exclusions (member_id_1);
create index if not exists match_exclusions_member_2_idx
  on postpartumpost.match_exclusions (member_id_2);
