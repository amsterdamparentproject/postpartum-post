-- Migration 025: match_draft_snapshots
--
-- match_drafts is a mutable working copy: reassignDraftMember() deletes and
-- re-inserts rows as Alex manually reassigns pairs before a round commits.
-- That means the matcher's original proposal for a round is lost the moment
-- she starts editing it, despite migration 005's comment describing
-- match_drafts as "a permanent record of what was proposed vs. what was
-- committed" — in the current implementation that's not true.
--
-- match_draft_snapshots is an immutable, append-only audit trail capturing
-- match_drafts at exactly two points in a round's lifecycle:
--   'original' — written once by /api/run-matcher immediately after the
--                algorithm generates a round, before any manual reassignment
--   'final'    — written once by /api/commit-matches immediately before
--                promoting match_drafts to matches, i.e. Alex's actual
--                final call for the round
--
-- Purpose: preserve both endpoints so algorithm-vs-human divergence can be
-- studied across many rounds (e.g. to retune matcher scoring weights) without
-- racing a live round's edits. Nothing reads or writes this table except
-- those two insert points — it is not used by the matcher or the admin UI.

create table if not exists postpartumpost.match_draft_snapshots (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references postpartumpost.match_rounds(id) on delete cascade,
  snapshot_type text not null check (snapshot_type in ('original', 'final')),
  member_id_1   uuid not null references postpartumpost.members(id),
  member_id_2   uuid not null references postpartumpost.members(id),
  score         float8 not null,
  breakdown     jsonb not null,
  quality_tier  text check (quality_tier in ('great', 'good', 'needs_work')),
  created_at    timestamptz not null default now(),
  constraint no_self_snapshot check (member_id_1 != member_id_2)
);

create index if not exists match_draft_snapshots_round_type_idx
  on postpartumpost.match_draft_snapshots (round_id, snapshot_type);

-- Guards against a route accidentally running twice and double-writing the
-- same snapshot for the same pair (order-independent — a member can still
-- appear in two different pairs within one snapshot, e.g. a double-match).
create unique index if not exists match_draft_snapshots_unique_pair_idx
  on postpartumpost.match_draft_snapshots (
    round_id, snapshot_type, least(member_id_1, member_id_2), greatest(member_id_1, member_id_2)
  );
