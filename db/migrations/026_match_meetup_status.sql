-- Migration 026: per-member meetup check-in on matches
--
-- Each member answers "Did you meet up with <name>?" independently on their
-- /matches card (Still planning / We met! / We didn't meet). A match is
-- always a pair, so the answers live on the match row itself — one column per
-- side, mirroring member_id_1 / member_id_2 — rather than in a separate table.
--
-- Defaults to 'planning', which is also what the card shows preselected.
-- For past months (including every match that predates this migration),
-- 'planning' just means "no answer".
--
-- Reading success at month end:
--   confirmed   both sides 'met'
--   likely      one side 'met'
--   didn't meet any side 'not_met', or both still 'planning'

create type postpartumpost.meetup_status as enum (
  'planning', -- "Still planning" (default)
  'met',      -- "We met!"
  'not_met'   -- "We didn't meet"
);

alter table postpartumpost.matches
  add column if not exists met_up_status_1 postpartumpost.meetup_status not null default 'planning',
  add column if not exists met_up_status_2 postpartumpost.meetup_status not null default 'planning';

-- Make the new columns visible to PostgREST right away.
notify pgrst, 'reload schema';
