-- Migration 008: replace match_type with topic_id on monthly_participation
-- The opt-in email captures topic choice (coffee or playdate), not match type.
-- The member's standing match_type preference on the members table is used by
-- the matcher directly — there's no need to override it per month.

alter table postpartumpost.monthly_participation
  drop column match_type,
  add column topic_id uuid not null references postpartumpost.topics(id);

create index if not exists monthly_participation_topic_id_idx
  on postpartumpost.monthly_participation (topic_id);
