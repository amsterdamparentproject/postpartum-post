-- Migration 031: Perk estimated savings
--
-- A whole-euro estimate of what a perk saves a member ("Save €15"), shown
-- as a badge on the perk card. Nullable: a perk without a clean € figure
-- simply shows no badge. Partners suggest it on the perk form; admin can override.
--
-- perks_partners is `select pk.*, ...`, and a view's column list is frozen
-- at CREATE time, so it has to be dropped and recreated (identical to
-- 030_perk_locations_and_tweaks.sql otherwise) for estimated_savings to
-- show up in it.

alter table postpartumpost.perks
  add column estimated_savings integer
  check (estimated_savings is null or (estimated_savings >= 0 and estimated_savings <= 9999));

drop view if exists postpartumpost.perks_partners;

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
