-- Migration 034: cohorts table, unique signup codes, cohort_joined_at, cohort_only
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
--   signup_code            the shared signup code, case-sensitive: members have to
--                          enter it exactly as given. NULL means
--                          signup is closed. A secret: it is read only on the
--                          server and never sent to the browser. It is NOT set
--                          by this migration, so it never enters the repo; set
--                          it in the Supabase SQL editor:
--                            update postpartumpost.cohorts
--                            set signup_code = '<code>' where slug = 'dsa';
--   signup_cap             maximum number of signups (members with this cohort).
--                          NULL means no cap.
--   grant_matches          matches granted at signup
--   partner_rate_cents     what the partner is invoiced per participant, for the
--                          admin headcount. Set in the SQL editor, like the code.
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
  signup_code text,
  signup_cap integer check (signup_cap is null or signup_cap > 0),
  grant_matches integer not null default 1 check (grant_matches >= 0),
  partner_rate_cents integer check (partner_rate_cents is null or partner_rate_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table postpartumpost.cohorts enable row level security;

-- A signup code identifies one cohort: existing members redeem a code on the
-- billing page without naming the cohort, so the code has to be unique.
create unique index if not exists cohorts_signup_code_key
  on postpartumpost.cohorts (signup_code)
  where signup_code is not null;

insert into postpartumpost.cohorts (slug, name, grant_matches)
values ('dsa', 'Dutch Speaking Academy', 1)
on conflict (slug) do nothing;

alter table postpartumpost.members
  add constraint members_cohort_fkey
  foreign key (cohort) references postpartumpost.cohorts (slug);

-- When a member joined their cohort. A new cohort signup joins at created_at,
-- but an existing member can redeem a code months after they signed up, and the
-- partner invoice is by month joined. Set at signup and at redemption.
alter table postpartumpost.members
  add column if not exists cohort_joined_at timestamptz;

-- A member's standing match-pool choice: true = matched only with their cohort,
-- false = anyone. Defaults to true, so a member who joins a cohort is matched
-- inside it until they pick "Anyone" on /profile. Ignored for members without a
-- cohort. Comped members can change it too: the free match being inside the
-- cohort is the default, not a lock.
alter table postpartumpost.members
  add column if not exists cohort_only boolean not null default true;

notify pgrst, 'reload schema';
