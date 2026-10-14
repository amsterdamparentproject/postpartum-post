-- Migration 033: cohort + billing_mode on members, cohort_only on monthly_participation
--
-- Groundwork for partner cohorts (first one: Dutch Speaking Academy, "dsa"),
-- and for the later move from Stripe Subscriptions to invoice billing.
--
-- members.cohort
--   Where the member came from, as a short slug ("dsa", later "fyp", ...).
--   Attribution, not an entitlement: it is set at signup and deliberately
--   never cleared when the member starts paying, so a partner's headcount and
--   "match me with my cohort again" keep working afterwards. Null for
--   everyone who joined through the normal signup.
--
-- members.billing_mode
--   How this member is billed right now:
--     'subscription'  a Stripe subscription exists (every member today)
--     'comped_no_perks'    no Stripe objects at all; the ledger grant is the
--                          whole entitlement, and Post Perks are not included
--                          (cohort signups with a free month)
--     'comped_with_perks'  the same, with Post Perks included (gifted
--                          memberships, FYP-style comps)
--     'invoiced'      reserved for the invoice-billing cutover; nothing sets
--                     it yet
--   The default means every existing member is 'subscription' with no
--   backfill needed.
--
-- monthly_participation.cohort_only
--   The member's per-round answer to "Match me only with another <cohort>
--   student". It belongs to the round, not the member, so it lives next to the
--   opt-in it qualifies. The matcher pairs a cohort_only member only with a
--   member of the same cohort. Forced true by the server for comped members
--   that have a cohort.

alter table postpartumpost.members
  add column if not exists cohort text,
  add column if not exists billing_mode text not null default 'subscription'
    constraint members_billing_mode_check
    check (billing_mode in ('comped_no_perks', 'comped_with_perks', 'subscription', 'invoiced'));

alter table postpartumpost.monthly_participation
  add column if not exists cohort_only boolean not null default false;

notify pgrst, 'reload schema';
