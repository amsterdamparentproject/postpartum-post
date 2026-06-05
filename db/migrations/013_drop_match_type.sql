-- Migration 013: Drop match_type from matches and match_drafts
--
-- The match_type enum ('in_person', 'online') was never meaningfully used.
-- Coffee and playdate are both in-person by nature; the topic distinction
-- (coffee vs. playdate) is tracked via monthly_participation.topic_id.

alter table postpartumpost.matches drop column if exists match_type;
alter table postpartumpost.match_drafts drop column if exists match_type;
drop type if exists postpartumpost.match_type;
