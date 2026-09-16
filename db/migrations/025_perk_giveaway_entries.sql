-- Migration 025: Perk giveaway entries
--
-- The /perks "suggest a place" box (components/PerkIdeaForm.tsx) gained a
-- checkbox: "I want to be in the running to win 1 of 3 free matches when
-- Post Perks launches" (the prize is a real 1-month gift card, see
-- lib/gift-cards.ts and __claude__/free-trial-plan.md — not a bespoke
-- "trial"). This needs its own table, separate from
-- partner_leads: a lead row represents a BUSINESS and gets deduped/merged
-- by business name or URL (lib/lead-matching.ts's findMatchingLead /
-- mergeIntoLead) — mergeIntoLead only backfills a lead's email/name if
-- that field is currently empty, so if two different people suggest the
-- same cafe, only the first entrant's contact info would ever be stored on
-- the lead row. A giveaway entry represents a PERSON's chance to win and
-- must never be silently dropped just because someone else already
-- nominated the same place. See __claude__/free-trial-plan.md for the
-- full design discussion.

drop table if exists postpartumpost.perk_giveaway_entries;

create table postpartumpost.perk_giveaway_entries (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  name                text,          -- optional
  email               text not null, -- the only thing that actually matters for a giveaway entry
  -- The exact link they entered, kept as its own snapshot rather than only
  -- read off partner_leads — dedup means partner_lead_id may point at a
  -- lead whose business_name/url got edited or merged since, and that
  -- shouldn't rewrite what this person actually submitted.
  url                 text not null,
  -- Which business (if any) they nominated when entering — nullable so a
  -- later edit/merge of the lead itself never invalidates the entry.
  partner_lead_id     uuid references postpartumpost.partner_leads(id) on delete set null,
  -- Alex picks the 3 winners herself, not a random draw (see
  -- free-trial-plan.md) — toggled directly in the DB for now, no admin UI
  -- built yet. Winning still requires a separate step: comping that
  -- person a 1-month gift card (lib/gift-cards.ts) — no automatic link
  -- from this flag to a gift_cards row yet.
  selected_as_winner  boolean not null default false
);
create index perk_giveaway_entries_email_idx on postpartumpost.perk_giveaway_entries (email);
