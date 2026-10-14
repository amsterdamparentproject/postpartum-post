-- Migration 035: cohort continue offer
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

alter table postpartumpost.cohorts
  add column if not exists continue_promo_code_id text;

notify pgrst, 'reload schema';
