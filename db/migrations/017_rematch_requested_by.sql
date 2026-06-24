-- Migration 017: track who requested the rematch
--
-- Allows the system to differentiate the experience for the requesting member
-- vs their match, and supports admin triage for safety-driven rematches.

alter table postpartumpost.matches
  add column if not exists rematch_requested_by uuid references postpartumpost.members(id) on delete set null;
