-- Migration 038: members.canceled_at
--
-- When the member canceled (set by unsubscribe, cleared when they resume or
-- start a new membership). Used to say "you canceled on <date>" in emails.
-- Null for members who never canceled, and for anyone who canceled before this
-- column existed (their date wasn't recorded).

alter table postpartumpost.members
  add column if not exists canceled_at timestamptz;
