-- Migration 023: perks
-- Post Perks: local businesses (and later, Circle of Experts contributors)
-- offer Postpartum Post members a discount in exchange for exposure. See
-- postpartum-post/__claude__/ for the build sheet this migration implements.
--
-- Lives entirely in the existing postpartumpost schema — no new schema, no
-- desk involvement, no new Supabase client.
--
-- Self-service (2026-09-02): partners sign in the same way members do —
-- Supabase magic-link against partners.email, no password, no separate
-- Supabase-Auth-user FK. requirePartner() mirrors lib/require-member.ts
-- exactly: verify the access token, look up partners by email. A partner
-- row with no email yet (an Alex-added Circle-of-Experts contributor, say)
-- simply has no portal access until one is set.

do $$ begin
  create type postpartumpost.perk_status as enum (
    'pending', 'coming_soon', 'published', 'rejected', 'archived'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type postpartumpost.perk_source as enum ('manual', 'partner_portal');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type postpartumpost.redemption_event_type as enum ('revealed', 'clicked');
exception
  when duplicate_object then null;
end $$;

-- The registry: perk-offering businesses today, Circle of Experts
-- contributors later. One table — no kind split; a Circle of Experts
-- contributor is just a partner with a person-shaped business_name.
create table if not exists postpartumpost.partners (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  first_name     text not null,
  last_name      text not null,
  business_name  text not null,
  url            text,
  description    text,
  image_url      text,   -- logo or headshot
  -- Self-service login identity — same role members.email already plays.
  -- Nullable: Alex can add a partner (e.g. an expert) with no portal access.
  email          text unique
);

-- One row per physical (or bookable) location a partner operates from — a
-- partner with two studios gets two rows here, and each perk points at the
-- one it's offered at. Mirrors activities.locations sitting apart from
-- activities.events, scoped to a single partner instead of being the org
-- record itself.
create table if not exists postpartumpost.partner_locations (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  partner_id   uuid not null references postpartumpost.partners(id) on delete cascade,
  label        text,   -- optional, e.g. "Center studio" — tells locations apart when there's >1
  address      text not null,
  latitude     numeric(9,6),  -- geocoded from address — same precision as activities.events
  longitude    numeric(9,6),
  area         text,   -- West/East/North/Center/South/Everywhere/Online — Desk's own fixed set, reused
  neighborhood text    -- free text, e.g. "Jordaan" — best-effort suggestion, always editable
);
create index if not exists partner_locations_partner_id_idx on postpartumpost.partner_locations (partner_id);
create index if not exists partner_locations_geo_idx on postpartumpost.partner_locations (latitude, longitude) where latitude is not null;

-- Fixed but editable — a table, not an enum. Same shape as postpartumpost.topics.
create table if not exists postpartumpost.perk_categories (
  id    uuid primary key default gen_random_uuid(),
  name  text not null unique
);
insert into postpartumpost.perk_categories (name)
  values ('Fitness'), ('Food & Drink'), ('Services')
  on conflict (name) do nothing;

create table if not exists postpartumpost.perks (
  id                       uuid primary key default gen_random_uuid(),
  created_at               timestamptz default now(),
  updated_at               timestamptz default now(),

  status                   postpartumpost.perk_status not null default 'pending',
  source                   postpartumpost.perk_source not null default 'manual',
  triage_notes             text,   -- Alex's internal notes; never shown to the partner or members

  partner_id               uuid not null references postpartumpost.partners(id) on delete cascade,
  location_id              uuid references postpartumpost.partner_locations(id) on delete set null,  -- nullable: which of the partner's locations this perk is offered at, if any
  partner_link             text,   -- perk-specific link; may differ from the partner's own url

  perk_title               text not null,   -- card headline, e.g. "20% off your first class"
  perk_description         text not null,
  perk_discount            text not null,
  redemption_instructions  text,  -- how to redeem, when it's not just "enter this code"
  perk_redemption_code     text,
  perk_redemption_url      text,
  featured                 boolean not null default false,
  expires_at               date   -- nullable: open-ended perks don't need one
);
create index if not exists perks_partner_id_idx on postpartumpost.perks (partner_id);

-- Standard categories (Fitness, Food & Drink, Services...) — many-to-many,
-- a spa could reasonably be both Fitness and Services.
create table if not exists postpartumpost.perks_category_links (
  perk_id      uuid not null references postpartumpost.perks(id) on delete cascade,
  category_id  uuid not null references postpartumpost.perk_categories(id) on delete cascade,
  primary key (perk_id, category_id)
);

-- "For coffee dates" / "For playdates" — reuses postpartumpost.topics directly
-- rather than inventing a second coffee/playdate vocabulary. A perk can match
-- one topic, both, or neither (a general perk with no topic tie).
create table if not exists postpartumpost.perks_topics (
  perk_id   uuid not null references postpartumpost.perks(id)   on delete cascade,
  topic_id  uuid not null references postpartumpost.topics(id)  on delete cascade,
  primary key (perk_id, topic_id)
);

-- Per-member, not anonymous: enables real analytics (repeat use, which
-- members engage) at the cost of storing who-viewed-what.
create table if not exists postpartumpost.perks_redemptions (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  perk_id     uuid not null references postpartumpost.perks(id)   on delete cascade,
  member_id   uuid not null references postpartumpost.members(id) on delete cascade,
  event_type  postpartumpost.redemption_event_type not null
);
create index if not exists perks_redemptions_perk_id_idx on postpartumpost.perks_redemptions (perk_id);

-- Views: the joins application code shouldn't have to repeat
create or replace view postpartumpost.perks_partners as
  select pk.*, pt.business_name as partner_name,
         pt.url as partner_url, pt.image_url as partner_image_url,
         pl.label as location_label, pl.address as location_address,
         pl.latitude as location_latitude, pl.longitude as location_longitude,
         pl.area as location_area, pl.neighborhood as location_neighborhood
  from postpartumpost.perks pk
  join postpartumpost.partners pt on pt.id = pk.partner_id
  left join postpartumpost.partner_locations pl on pl.id = pk.location_id;

create or replace view postpartumpost.perks_categories as
  select pcl.perk_id, pc.id as category_id, pc.name as category_name
  from postpartumpost.perks_category_links pcl
  join postpartumpost.perk_categories pc on pc.id = pcl.category_id;

-- updated_at triggers — same handle_updated_at() every other table here uses
do $$ begin
  create trigger set_updated_at_partners
    before update on postpartumpost.partners
    for each row execute function postpartumpost.handle_updated_at();
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create trigger set_updated_at_partner_locations
    before update on postpartumpost.partner_locations
    for each row execute function postpartumpost.handle_updated_at();
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create trigger set_updated_at_perks
    before update on postpartumpost.perks
    for each row execute function postpartumpost.handle_updated_at();
exception
  when duplicate_object then null;
end $$;
