-- Migration 035: cohort continue offer (promotion code + sent marker)
--
-- After a comped cohort member's free match, we email two checkout links
-- (1 round, 3 rounds) with one Stripe promotion code applied. This column points
-- a cohort at that promotion code.
--
--   continue_promo_code_id  Stripe promotion code id (promo_...). The discount and
--                           the prices shown are read from Stripe, so any coupon
--                           works. NULL means the cohort has no continue offer
--                           yet. Set in the Supabase SQL editor once the code
--                           exists in Stripe:
--                             update postpartumpost.cohorts
--                             set continue_promo_code_id = 'promo_...'
--                             where slug = 'dsa';

--   members.continue_offer_sent_at
--                           when the continue email was claimed for this member
--                           (the "already sent" marker). NULL = not sent yet. The
--                           monthly job (POST /api/send-continue-offers) and the
--                           manual script (yarn cohort-continue:prod) set it
--                           BEFORE sending, so a retry or a double run can't send
--                           twice, and clear it again if the send fails. To send
--                           one member the offer again, set it back to NULL:
--                             update postpartumpost.members
--                             set continue_offer_sent_at = null
--                             where email = '...';

alter table postpartumpost.cohorts
  add column if not exists continue_promo_code_id text;

alter table postpartumpost.members
  add column if not exists continue_offer_sent_at timestamptz;

-- cohorts.partner_rate_eur replaces cohorts.partner_rate_cents (034).
-- What the partner is invoiced per participant, in EUROS with two decimals
-- (6.00 = EUR 6), so the number you type in the SQL editor is the number you
-- mean. (Stripe amounts elsewhere in the app stay in cents.) Nothing in the app
-- reads the old column, and the old column's value is dropped with it, so set
-- the rate again after running this:
--   update postpartumpost.cohorts set partner_rate_eur = 6 where slug = 'dsa';
alter table postpartumpost.cohorts
  add column if not exists partner_rate_eur numeric(6, 2)
  check (partner_rate_eur is null or partner_rate_eur >= 0);

alter table postpartumpost.cohorts
  drop column if exists partner_rate_cents;

notify pgrst, 'reload schema';
