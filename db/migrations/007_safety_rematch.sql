-- Migration 007: safety rematch reasons + flagged_for_review on matches
--
-- Expands the rematch_reason enum with two safety-specific values:
--   safety_concern  → member felt unsafe or uncomfortable
--   harassment      → member experienced harassment or unwanted contact
-- These route into the safety report flow rather than the normal rematch pool.
-- The actual reason is stored in the DB but not surfaced on the member-facing
-- match card — safety cards show "We're looking into this" instead.
--
-- Adds flagged_for_review to matches so safety-flagged matches are clearly
-- distinguishable from routine rematches and land in a single review queue.

alter type postpartumpost.rematch_reason add value if not exists 'safety_concern';
alter type postpartumpost.rematch_reason add value if not exists 'harassment';

alter table postpartumpost.matches
  add column if not exists flagged_for_review boolean not null default false;

create index if not exists matches_flagged_for_review_idx
  on postpartumpost.matches (flagged_for_review)
  where flagged_for_review = true;
