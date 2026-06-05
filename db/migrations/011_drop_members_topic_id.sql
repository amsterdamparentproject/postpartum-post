-- Migration 011: schema preference cleanup
--
-- 1. Drop topic_id from members
--    Superseded by monthly_participation.topic_id (per-month choice from opt-in email).
--
-- 2. Drop match_type from members
--    Coffee and playdate are both in-person by nature; online matching isn't a
--    separate preference that needs capturing at the member level.
--    match_type remains on the matches and match_drafts tables as a result field.
--
-- 3. Add parent_type
--    "Who are you open to meeting?" — mom | dad | anyone.
--    Non-negotiable: mom + dad is a hard exclusion in the matcher.
--    Scored like language: 1000pts when both have the same non-anyone value.

drop index if exists postpartumpost.members_topic_id_idx;

alter table postpartumpost.members
  drop column if exists topic_id,
  drop column if exists match_type;

create type postpartumpost.parent_type as enum ('mom', 'dad', 'anyone');

alter table postpartumpost.members
  add column parent_type postpartumpost.parent_type not null default 'anyone';
