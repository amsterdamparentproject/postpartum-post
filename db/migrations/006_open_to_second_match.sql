-- Migration 006: open_to_second_match column on members
-- Indicates whether a member is willing to be matched twice in a month.
-- Used in two scenarios:
--   1. Odd-numbered opt-in pools: a member with open_to_second_match = true can
--      absorb the leftover person so no one goes unmatched. The matcher should
--      prefer the candidate whose combined scores against both partners are highest.
--   2. Rematch: members with open_to_second_match = true are available to be
--      pulled into the rematch pool if their first match didn't work out.
--
-- Default true — members who haven't expressed a preference stay in the pool.
-- Members can toggle this in their profile settings.

alter table postpartumpost.members
  add column if not exists open_to_second_match boolean not null default true;
