-- Migration 027: Simplify perks
--
-- See __claude__/perks-simplification-plan.md. The perk form drops from 11
-- fields to 6, modeled on kortingscode.nl's offer shape (headline · one-liner
-- · code/deal · expiry · exclusive), plus an in-person redemption type.
--
-- Safe to drop and recreate every perk table: there is no perk data in
-- production. `partners` and `partner_locations` DO have production data and
-- are not touched here. Never re-run 024 to get this shape: 024 drops
-- `partners`.
--
-- What changes:
--   * perk_title + perk_discount       -> title
--   * perk_description                 -> description (absorbs redemption_instructions)
--   * perk_redemption_code             -> redemption_code
--   * partner_link + perk_redemption_url -> url: one optional link on every
--     perk, separate from how it's redeemed — where to redeem OR learn more
--     (e.g. an in-person perk linking to the cafe). Cards fall back to partners.url.
--   * new redemption_type: code / in_person / online
--   * categories and coffee/playdate tagging (perks_topics) both dropped for
--     now — categorization gets rethought as a whole later
--   * perks_redemptions (revealed/clicked) -> perk_events (viewed/redeemed),
--     with a stored month and one 'redeemed' per member, perk and month
--   * partner-images storage bucket for partner photo uploads

drop view if exists postpartumpost.perks_categories;
drop view if exists postpartumpost.perks_partners;
drop table if exists postpartumpost.perks_redemptions;
drop table if exists postpartumpost.perks_topics;
drop table if exists postpartumpost.perks_category_links;
drop table if exists postpartumpost.perks;
drop table if exists postpartumpost.perk_categories;
drop type if exists postpartumpost.redemption_event_type;

create type postpartumpost.perk_redemption_type as enum ('code', 'in_person', 'online');

create type postpartumpost.perk_event_type as enum ('viewed', 'redeemed');

create table postpartumpost.perks (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),

  status           postpartumpost.perk_status not null default 'pending',
  source           postpartumpost.perk_source not null default 'manual',
  triage_notes     text,   -- Alex's internal notes; never shown to the partner or members

  partner_id       uuid not null references postpartumpost.partners(id) on delete cascade,
  location_id      uuid references postpartumpost.partner_locations(id) on delete set null,

  title            text not null,   -- the headline IS the value: "20% off your first class"
  description      text not null,   -- one sentence; also says how to redeem in person
  redemption_type  postpartumpost.perk_redemption_type not null,
  redemption_code  text,            -- required when redemption_type = 'code'
  url              text,            -- optional "where to redeem / learn more"; required when 'online'; cards fall back to partners.url

  featured         boolean not null default false,
  -- Opt-in exclusivity in exchange for extra promotion — see
  -- components/PartnerTerms.tsx. Trust-based, never enforced here.
  exclusive        boolean not null default false,
  expires_at       date,            -- nullable: open-ended perks don't need one

  constraint perks_code_required check (redemption_type <> 'code' or redemption_code is not null),
  constraint perks_url_required  check (redemption_type <> 'online' or url is not null),
  constraint perks_title_length  check (char_length(title) <= 60),
  constraint perks_description_length check (char_length(description) <= 160)
);
create index perks_partner_id_idx on postpartumpost.perks (partner_id);

-- Per-member events. 'viewed' = opened the perk page (partner exposure
-- counts); 'redeemed' = confirmed "Use this perk" (the monthly-use record).
-- `month` is stored rather than derived because a unique index can't
-- compute it from created_at.
create table postpartumpost.perk_events (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  perk_id     uuid not null references postpartumpost.perks(id)   on delete cascade,
  member_id   uuid not null references postpartumpost.members(id) on delete cascade,
  event_type  postpartumpost.perk_event_type not null,
  month       date not null default (date_trunc('month', now() at time zone 'Europe/Amsterdam'))::date
);
create index perk_events_perk_id_idx on postpartumpost.perk_events (perk_id);
create unique index perk_events_one_redeem_per_month
  on postpartumpost.perk_events (perk_id, member_id, month)
  where event_type = 'redeemed';

create view postpartumpost.perks_partners as
  select pk.*, pt.business_name as partner_name,
         pt.url as partner_url, pt.image_url as partner_image_url,
         pt.description as partner_description,
         pl.label as location_label, pl.address as location_address,
         pl.latitude as location_latitude, pl.longitude as location_longitude,
         pl.area as location_area, pl.neighborhood as location_neighborhood
  from postpartumpost.perks pk
  join postpartumpost.partners pt on pt.id = pk.partner_id
  left join postpartumpost.partner_locations pl on pl.id = pk.location_id;

create trigger set_updated_at_perks
  before update on postpartumpost.perks
  for each row execute function postpartumpost.handle_updated_at();

-- Partner photos (partners.image_url). Public read; every write goes through
-- the server with the service role (signed upload URLs), so no storage RLS
-- policies are needed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partner-images', 'partner-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

notify pgrst, 'reload schema';
