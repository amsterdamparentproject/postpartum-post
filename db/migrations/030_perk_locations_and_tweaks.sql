-- Migration 030: perk description limit, partner-agnostic "Online" flag,
-- and multiple locations per perk
--
-- Three perk changes bundled together since none has run against
-- production yet.

-- Raise the description limit to 300 characters. Was 160
-- (027_simplify_perks.sql) -- too tight for some partner descriptions.
-- Mirrors PERK_DESCRIPTION_MAX in lib/perk-input.ts.
alter table postpartumpost.perks
  drop constraint perks_description_length;

alter table postpartumpost.perks
  add constraint perks_description_length check (char_length(description) <= 300);

-- Partner-agnostic "Online" flag. location_id (partner_locations) always
-- requires a partner-owned row with a real address (024_perks.sql) --
-- fine for a physical spot, awkward for a perk that's genuinely online
-- everywhere (no address to give it). Adds a standalone flag instead of
-- asking every partner to create a fake "Online" location row of their
-- own. Independent of location(s) below -- a perk can be both online and
-- available at specific spots (e.g. "book online or visit our Jordaan
-- studio"), so no exclusivity constraint between them.
alter table postpartumpost.perks
  add column is_online boolean not null default false;

-- perks.location_id was a single nullable FK -- a perk could be tied to at
-- most one of a partner's locations. Partners increasingly want to list
-- the same perk at several of their studios/locations, so this moves to a
-- many-to-many join table (perk_locations), the same shape as
-- perks_category_links and perks_topics (024_perks.sql).
create table postpartumpost.perk_locations (
  perk_id      uuid not null references postpartumpost.perks(id) on delete cascade,
  location_id  uuid not null references postpartumpost.partner_locations(id) on delete cascade,
  primary key (perk_id, location_id)
);
create index perk_locations_location_id_idx on postpartumpost.perk_locations (location_id);

-- Backfill every perk's single existing location_id, if it had one.
insert into postpartumpost.perk_locations (perk_id, location_id)
  select id, location_id from postpartumpost.perks where location_id is not null;

-- perks_partners (027_simplify_perks.sql) still reads location_id directly
-- (pk.*), so it has to go before the column drop below, not after.
drop view postpartumpost.perks_partners;

alter table postpartumpost.perks drop column location_id;

-- The single left-joined location's columns
-- (location_label/address/latitude/longitude/area/neighborhood) are
-- replaced by one `locations` jsonb array, one element per linked location.
-- Never the partner's internal label or street address in it -- same rule
-- lib/perk-display.ts's perkLocationLabel already followed.
create view postpartumpost.perks_partners as
  select pk.*, pt.business_name as partner_name,
         pt.url as partner_url, pt.image_url as partner_image_url,
         pt.description as partner_description,
         coalesce(loc.locations, '[]'::jsonb) as locations
  from postpartumpost.perks pk
  join postpartumpost.partners pt on pt.id = pk.partner_id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'neighborhood', pl.neighborhood,
        'area', pl.area,
        'latitude', pl.latitude,
        'longitude', pl.longitude
      )
      order by pl.created_at
    ) as locations
    from postpartumpost.perk_locations plk
    join postpartumpost.partner_locations pl on pl.id = plk.location_id
    where plk.perk_id = pk.id
  ) loc on true;

notify pgrst, 'reload schema';
