-- Migration 022: match_ledger
-- See __claude__/billing-simplification-plan.md for the full design. This
-- migration is Track B, step 1 — write-only, zero risk: nothing reads
-- matches_remaining yet, so nothing here can affect a member.
--
-- The DB starts tracking what a member is owed (matches_remaining) instead
-- of Stripe's trial_end/billing dates deciding when they're billed.
--
--   term_payment / invoice.payment_succeeded  -> delta = +interval_count
--   match_delivered / commit-matches           -> delta = -1
--   no_response / commit-matches               -> delta = -1
--
-- match_entitlements is the append-only fact table. match_ledger is a VIEW
-- unioning it with monthly_participation and monthly_skips (already the
-- source of truth for opt-ins/skips — no dual-write) plus two derived legs:
-- `unmatched` (opted in, round locked, never paired) and `second_match`
-- (any match beyond the first that member got that month). Derived facts
-- can't drift from the tables they're computed over.
--
-- record_entitlement() is the only writer of match_entitlements: it inserts
-- the fact and bumps members.matches_remaining in one transaction, and
-- swallows a unique_violation (replayed invoice, or a second decrement in
-- the same month from any cause) as a no-op — that's what makes refills and
-- decrements replay-safe without the caller needing to pre-check anything.

alter table postpartumpost.members
  add column if not exists matches_remaining integer not null default 0;

do $$ begin
  create type postpartumpost.entitlement_event as enum (
    'term_payment',     -- invoice.payment_succeeded       delta = +N
    'match_delivered',  -- commit-matches, once per round  delta = -1
    'no_response',      -- neither opted in nor skipped    delta = -1
    'manual_grant',     -- customer service                delta = +N
    'manual_backfill',  -- one-time seed at cutover        delta = +N
    'payment_failed',   -- resume attempt failed           delta =  0
    'canceled'          -- membership ended                delta =  0
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists postpartumpost.match_entitlements (
  id                 uuid primary key default gen_random_uuid(),
  member_id          uuid not null references postpartumpost.members(id) on delete cascade,
  event              postpartumpost.entitlement_event not null,
  delta              integer not null default 0,
  month              date,
  match_id           uuid references postpartumpost.matches(id) on delete set null,
  stripe_invoice_id  text,
  note               text,
  created_at         timestamptz not null default now()
);

-- Stripe redelivers webhooks routinely; without this a replay grants twice.
create unique index if not exists match_entitlements_invoice_idx
  on postpartumpost.match_entitlements (stripe_invoice_id)
  where stripe_invoice_id is not null;

-- ONE decrement per member per month, from any cause (matched, double-matched,
-- or no_response) — this is what makes a double match or a rematch free, and
-- what stops no_response stacking on top of match_delivered.
create unique index if not exists match_entitlements_decrement_month_idx
  on postpartumpost.match_entitlements (member_id, month)
  where delta < 0;

create index if not exists match_entitlements_member_idx
  on postpartumpost.match_entitlements (member_id, created_at desc);

-- Atomic, replay-safe writer. Returns true if the entitlement was recorded,
-- false if it was rejected as a duplicate (replayed invoice, or a second
-- decrement for the same member/month) — callers treat false as a no-op,
-- not an error.
create or replace function postpartumpost.record_entitlement(
  p_member_id uuid,
  p_event postpartumpost.entitlement_event,
  p_delta integer,
  p_month date default null,
  p_match_id uuid default null,
  p_stripe_invoice_id text default null,
  p_note text default null
) returns boolean
language plpgsql
as $$
begin
  insert into postpartumpost.match_entitlements
    (member_id, event, delta, month, match_id, stripe_invoice_id, note)
  values
    (p_member_id, p_event, p_delta, p_month, p_match_id, p_stripe_invoice_id, p_note);

  -- Floor at zero: sum(delta) is the invariant in the normal case, but this
  -- guards against the counter ever being pushed negative by an edge case
  -- (e.g. a decrement landing before matches_remaining was seeded).
  update postpartumpost.members
    set matches_remaining = greatest(matches_remaining + p_delta, 0)
    where id = p_member_id;

  return true;
exception
  when unique_violation then
    return false;
end;
$$;

-- A view, not a table, so no fact is written twice. monthly_skips and
-- monthly_participation already own skips and opt-ins; unmatched and
-- second_match are derived and can't drift — either fact is true or it isn't.
create or replace view postpartumpost.match_ledger as
with matches_unpivoted as (
  select id as match_id, member_id_1 as member_id, matched_on, created_at
  from postpartumpost.matches
  union all
  select id as match_id, member_id_2 as member_id, matched_on, created_at
  from postpartumpost.matches
),
ranked_matches as (
  select
    match_id,
    member_id,
    matched_on,
    created_at,
    row_number() over (
      partition by member_id, matched_on
      order by created_at, match_id
    ) as rn
  from matches_unpivoted
)
select
  member_id,
  event::text as event,
  month,
  delta,
  match_id,
  created_at as occurred_at
from postpartumpost.match_entitlements

union all

select
  member_id,
  'opted_in' as event,
  month,
  0 as delta,
  null::uuid as match_id,
  opted_in_at as occurred_at
from postpartumpost.monthly_participation

union all

select
  member_id,
  'skipped' as event,
  month,
  0 as delta,
  null::uuid as match_id,
  created_at as occurred_at
from postpartumpost.monthly_skips

union all

-- Any match beyond the first a member got in a given month. The first is
-- already represented by the match_delivered row commit-matches writes;
-- this leg only ever adds the second (or later) one.
select
  member_id,
  'second_match' as event,
  matched_on as month,
  0 as delta,
  match_id,
  created_at as occurred_at
from ranked_matches
where rn > 1

union all

-- Opted in, the round for that month locked, and never paired. Only
-- meaningful once a round is locked — a draft/committed round hasn't
-- finished deciding who's unmatched yet.
select
  mp.member_id,
  'unmatched' as event,
  mp.month,
  0 as delta,
  null::uuid as match_id,
  mr.locked_at as occurred_at
from postpartumpost.monthly_participation mp
join postpartumpost.match_rounds mr on mr.month = mp.month
where mr.status = 'locked'
  and not exists (
    select 1
    from postpartumpost.matches m
    where m.matched_on = mp.month
      and (m.member_id_1 = mp.member_id or m.member_id_2 = mp.member_id)
  );
