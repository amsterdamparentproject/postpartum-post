-- Migration 024: partner_leads
-- Lightweight lead capture for Post Perks, added when Alex decided the
-- /perks/submit removal (migration 023) needed an inbound-interest path back:
-- a business that isn't in `partners` yet can express interest from the
-- /partners login screen's "not found" state (mirrors how MagicLinkRequest
-- already shows a signup form there for members) — one email + a Slack
-- ping via n8n (see lib/n8n-webhook.ts), no account, no auth, no live perk.
-- Alex reaches out herself and adds them to `partners` if it's a fit.

do $$ begin
  create type postpartumpost.lead_status as enum (
    'new', 'contacted', 'converted', 'rejected'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists postpartumpost.partner_leads (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),

  first_name           text,
  last_name            text,
  business_name        text not null,
  email                text not null,
  note                 text,   -- "tell us about your perk idea" — optional, free text

  status               postpartumpost.lead_status not null default 'new',
  -- Set once Alex actually adds them as a partner, so a lead's outcome
  -- stays traceable instead of just flipping a status flag.
  converted_partner_id uuid references postpartumpost.partners(id) on delete set null
);
create index if not exists partner_leads_status_idx on postpartumpost.partner_leads (status);

do $$ begin
  create trigger set_updated_at_partner_leads
    before update on postpartumpost.partner_leads
    for each row execute function postpartumpost.handle_updated_at();
exception
  when duplicate_object then null;
end $$;
