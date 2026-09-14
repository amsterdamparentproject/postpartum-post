-- Migration 026: partner_leads — url field, 'idea' status
--
-- 024_partner_leads.sql already ran against the dev DB, so this can't just
-- edit that file in place — its `create table if not exists` / `do $$ ...
-- exception when duplicate_object` guards would silently no-op against an
-- already-existing table/type, and ALTERing a NOT NULL `url` column onto a
-- table with no backfill plan isn't worth it. Nothing real lives in
-- partner_leads yet, so Alex opted to drop and recreate rather than ALTER
-- in place.
--
-- Changes from 024:
--   - `url` column (not null) — the business's own site, so Alex can vet a
--     lead/idea before reaching out. Collected on both the public
--     PartnerLeadForm and the admin-side "+ Add idea" form.
--   - `first_name`/`last_name`/`email` are now nullable — an 'idea' lead
--     Alex adds herself (see below) may have no contact person picked out
--     yet. A public submission (submitPartnerLead) still enforces these
--     not-blank at the application layer.
--   - `lead_status` gains 'idea': a potential partner Alex identifies
--     herself from /admin/partners, as opposed to 'new', which is always
--     an inbound public submission.

drop table if exists postpartumpost.partner_leads;
drop type if exists postpartumpost.lead_status;

create type postpartumpost.lead_status as enum (
  'idea', 'new', 'contacted', 'converted', 'rejected'
);

create table postpartumpost.partner_leads (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),

  first_name           text,   -- nullable: unset for an admin-added 'idea' with no contact yet
  last_name            text,   -- nullable: see first_name
  business_name        text not null,
  url                  text not null,   -- the business's own site — lets Alex vet an idea/lead before reaching out
  email                text,   -- nullable: see first_name
  note                 text not null,   -- "tell us about your perk idea" / Alex's own reason — required, some effort > none

  status               postpartumpost.lead_status not null default 'new',
  -- Set once Alex actually adds them as a partner, so a lead's outcome
  -- stays traceable instead of just flipping a status flag.
  converted_partner_id uuid references postpartumpost.partners(id) on delete set null
);
create index partner_leads_status_idx on postpartumpost.partner_leads (status);

create trigger set_updated_at_partner_leads
  before update on postpartumpost.partner_leads
  for each row execute function postpartumpost.handle_updated_at();
