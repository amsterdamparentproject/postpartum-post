-- Migration 028: Perk intro offers
--
-- Lets a perk be marked as a one-time "intro offer" -- e.g. "20% off your
-- first Carry & Groove workshop" -- redeemable once per member, ever,
-- instead of the default once-per-calendar-month every other perk gets
-- (027_simplify_perks.sql).
--
-- Modeled as a new `frequency` column rather than a boolean, so a third
-- cadence (e.g. "once per year") doesn't need another migration later.
--
-- Enforcement mirrors the existing once-per-month mechanism exactly: that
-- one relies on a unique index on (perk_id, member_id, month) and the app
-- treating a 23505 (unique_violation) insert error as "already redeemed,
-- not a real error" (see redeemPerk in app/(account)/my-perks/actions.ts).
-- A unique index can't reach across to perks.frequency though, so a
-- trigger does the equivalent check for 'once' perks and raises the same
-- 23505 error code -- the app's existing error handling picks it up
-- unchanged.
--
-- Consolidated (2026-09-28): originally split across this file and
-- 029_perks_partners_view_frequency.sql, run in that order against dev
-- only -- never against production, so (same call 024_perks.sql already
-- made for its own split history) there's no real prod data forcing a
-- step-by-step record. 029 existed because `perks_partners` (defined as
-- `select pk.*, ...`) does NOT automatically pick up a column added to
-- `perks` afterward -- a view's column list is frozen at CREATE time, so
-- the original comment below claiming "the new column already flows
-- through the view" was wrong, and every query selecting `frequency` from
-- perks_partners silently came back empty until the view was dropped and
-- recreated. Folded in here from the start so a future reader (or anyone
-- applying this fresh, e.g. to production) doesn't hit that gap.

create type postpartumpost.perk_frequency as enum ('monthly', 'once');

alter table postpartumpost.perks
  add column frequency postpartumpost.perk_frequency not null default 'monthly';

create or replace function postpartumpost.enforce_perk_intro_offer_limit()
returns trigger as $$
declare
  perk_frequency postpartumpost.perk_frequency;
  already_redeemed boolean;
begin
  if new.event_type <> 'redeemed' then
    return new;
  end if;

  select frequency into perk_frequency
  from postpartumpost.perks
  where id = new.perk_id;

  if perk_frequency = 'once' then
    select exists(
      select 1 from postpartumpost.perk_events
      where perk_id = new.perk_id
        and member_id = new.member_id
        and event_type = 'redeemed'
    ) into already_redeemed;

    if already_redeemed then
      raise exception 'Intro offer already redeemed by this member'
        using errcode = '23505';
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

-- Runs before the existing once-per-month unique index is checked; for a
-- 'monthly' perk this is a no-op (perk_frequency <> 'once') and that index
-- still does its usual job unchanged.
create trigger enforce_perk_intro_offer_limit_trigger
  before insert on postpartumpost.perk_events
  for each row execute function postpartumpost.enforce_perk_intro_offer_limit();

-- perks_partners must be recreated, not just left alone, for `frequency`
-- (or any new perks column) to actually show up in it -- see the
-- consolidation note above. create or replace view can't do this either:
-- frequency lands in the middle of the view's column list (right after
-- pk.*'s existing columns, before partner_name), and Postgres only allows
-- create or replace to add columns at the end. Drop and recreate,
-- identical to 027_simplify_perks.sql's definition otherwise.
drop view if exists postpartumpost.perks_partners;

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

notify pgrst, 'reload schema';
