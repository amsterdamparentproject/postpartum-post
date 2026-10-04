-- Migration 032: Perk idea follow-ups ("Tell me when this becomes a Perk")
--
-- The /perks "suggest a place" box (components/PerkIdeaForm.tsx) gets a second,
-- independent checkbox next to the giveaway one: "Tell me when this becomes a
-- Perk". Ticking it means: email this person once if the spot they suggested
-- goes live as a Post Perk. It is deliberately NOT part of the giveaway: you can
-- ask to be told without entering the drawing, and entering the drawing never
-- signs anyone up for this (see app/terms/giveaway/page.tsx).
--
-- Its own table (not a column on perk_giveaway_entries) for the same reason
-- that table is separate from partner_leads: a row here is a PERSON's request
-- to be told, which must never be dropped because someone else already
-- suggested the same business, and it must exist without a giveaway entry.
--
-- Nothing sends these emails yet. notified_at is for whoever does the send
-- (by hand or later) to stamp, so nobody is ever emailed twice.

create table if not exists postpartumpost.perk_idea_followups (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  name             text,          -- optional
  email            text not null,
  -- The exact link they entered (snapshot, like perk_giveaway_entries.url).
  url              text not null,
  -- Which lead they suggested; nullable so a later edit/merge of the lead
  -- never invalidates the request. This is what you join on when the lead
  -- becomes a perk.
  partner_lead_id  uuid references postpartumpost.partner_leads(id) on delete set null,
  -- Set when the "it's a Perk now" email went out to this person.
  notified_at      timestamptz
);

create index if not exists perk_idea_followups_lead_idx on postpartumpost.perk_idea_followups (partner_lead_id);
create index if not exists perk_idea_followups_email_idx on postpartumpost.perk_idea_followups (email);
