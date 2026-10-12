-- Migration 034: cohorts table
--
-- Moves per-cohort settings out of code and environment variables. Until now
-- the Dutch Speaking Academy cohort ("dsa") was hard-coded: its name and
-- checkbox label in lib/cohort.ts, its signup code in the DSA_SIGNUP_CODE env
-- var. A cohort is now one row here, so adding the next partner (AIC, FYP, ...)
-- is an insert, not a deploy.
--
-- One row per cohort:
--   slug                   short id stored in members.cohort ("dsa")
--   name                   display name used in member-facing copy
--   signup_code            the shared signup code, stored lower-case. NULL means
--                          signup is closed. A secret: it is read only on the
--                          server and never sent to the browser. It is NOT set
--                          by this migration, so it never enters the repo; set
--                          it in the Supabase SQL editor:
--                            update postpartumpost.cohorts
--                            set signup_code = lower('<code>') where slug = 'dsa';
--   signup_cap             maximum number of signups (members with this cohort).
--                          NULL means no cap.
--   grant_matches          matches granted at signup
--   restrict_while_comped  comped members of this cohort are matched only
--                          inside the cohort (DSA: true, FYP: false)
--   offers_choice          after the member starts paying, they get the editable
--                          "match me only with <cohort>" checkbox
--   partner_rate_cents     what the partner is invoiced per participant, for the
--                          admin headcount. Set in the SQL editor, like the code.
--   perk_text, logo_url    optional partner copy and logo for member-facing pages
--   active                 inactive cohorts refuse new signups
--
-- Row level security is on with no policies: only the service role (the
-- server) can read the table, because it holds the signup code.
--
-- members.cohort becomes a foreign key to cohorts.slug. Every existing value
-- is NULL, so this is safe on prod.

create table if not exists postpartumpost.cohorts (
  slug text primary key check (slug = lower(slug)),
  name text not null,
  signup_code text check (signup_code is null or signup_code = lower(signup_code)),
  signup_cap integer check (signup_cap is null or signup_cap > 0),
  grant_matches integer not null default 1 check (grant_matches >= 0),
  restrict_while_comped boolean not null default false,
  offers_choice boolean not null default false,
  partner_rate_cents integer check (partner_rate_cents is null or partner_rate_cents >= 0),
  perk_text text,
  logo_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table postpartumpost.cohorts enable row level security;

insert into postpartumpost.cohorts (slug, name, grant_matches, restrict_while_comped, offers_choice, logo_url)
values ('dsa', 'Dutch Speaking Academy', 1, true, true, '/dsa/dsa-logo.png')
on conflict (slug) do nothing;

alter table postpartumpost.members
  add constraint members_cohort_fkey
  foreign key (cohort) references postpartumpost.cohorts (slug);

notify pgrst, 'reload schema';
