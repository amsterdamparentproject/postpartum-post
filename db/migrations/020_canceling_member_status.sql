-- Add 'canceling' to the member_status enum.
-- Used for members who have canceled their subscription but still have
-- paid access until the end of their billing period. They continue to
-- receive opt-in emails and are eligible for matching. The Stripe
-- customer.subscription.deleted webhook transitions them to 'inactive'
-- when the period actually expires.
alter type postpartumpost.member_status add value if not exists 'canceling';
