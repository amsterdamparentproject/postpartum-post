-- 004_waitlist.sql
-- Creates a lightweight waitlist table for capturing emails before general signups open.
-- Intentionally separate from members — waitlist entries have no subscription, profile, or billing context.

CREATE TABLE postpartumpost.waitlist (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text        NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
