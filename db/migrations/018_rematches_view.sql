-- Migration 018: rematches view
--
-- Provides a clean query surface for rematch data without moving columns
-- off the matches table. Useful for admin queries and future reporting.

create or replace view postpartumpost.rematches as
select
  id                   as match_id,
  member_id_1,
  member_id_2,
  matched_on,
  rematch_reason       as reason,
  rematch_requested_at as requested_at,
  rematch_requested_by as requested_by,
  flagged_for_review
from postpartumpost.matches
where rematch_requested = true;
