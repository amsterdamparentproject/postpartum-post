create table postpartumpost.gift_cards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  stripe_coupon_id text not null,
  stripe_promotion_code_id text not null,
  buyer_email text,
  recipient_email text,
  gift_months integer not null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);
