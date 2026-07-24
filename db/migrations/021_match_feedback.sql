-- Feedback members submit about their match experience via /feedback.
-- match_ids is best-effort (all matches sharing the member's most recent
-- matched_on date — usually one, but two for a double-matched month) and may
-- be null/empty if the member has never been matched; feedback is still
-- accepted. Plain array, not a foreign key — Postgres doesn't support array
-- FKs, so referential integrity here is informational only.
create table postpartumpost.match_feedback (
  id                       uuid primary key default gen_random_uuid(),
  member_id                uuid not null references postpartumpost.members(id) on delete cascade,
  match_ids                uuid[],
  happy_with_match         smallint not null check (happy_with_match between 1 and 5),
  matching_process_rating  smallint not null check (matching_process_rating between 1 and 5),
  match_page_helpful       smallint not null check (match_page_helpful between 1 and 5),
  activities_relevant      smallint not null check (activities_relevant between 1 and 5),
  activities_feedback      text,
  general_feedback         text,
  willing_to_follow_up     boolean not null default false,
  created_at               timestamptz not null default now()
);

create index on postpartumpost.match_feedback (member_id);
create index on postpartumpost.match_feedback using gin (match_ids);
