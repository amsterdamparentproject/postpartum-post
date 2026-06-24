-- Migration 019: signup consent timestamps
--
-- Records the moment each member agreed to the Community Guidelines and
-- confirmed their eligibility. Both are required at signup and stored as
-- timestamptz so we have a dated, on-the-record acceptance per member.
-- Nullable on existing rows — only new signups from this point forward
-- will carry these values.

alter table postpartumpost.members
  add column if not exists guidelines_accepted_at   timestamptz,
  add column if not exists eligibility_confirmed_at timestamptz;
