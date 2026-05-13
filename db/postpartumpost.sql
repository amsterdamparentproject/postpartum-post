create schema if not exists postpartumpost;

create table postpartumpost.members (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null unique,
  zipcode text,
  topic text,
  language text,
  stripe_customer_id text,
  status text default 'pending',
  created_at timestamptz default now()
);

create table postpartumpost.subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references postpartumpost.members(id),
  stripe_subscription_id text not null,
  stripe_customer_id text,
  status text default 'active',
  created_at timestamptz default now()
);