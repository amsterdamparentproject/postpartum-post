-- Migration 036: members.cohort_only means "restricted to my cohort", so only
-- cohort members start with it set
--
-- Migration 034 defaulted members.cohort_only to TRUE for every member, which
-- left TRUE on people with no cohort (where it does nothing) and made a cohort
-- member's "Anyone" choice look like the odd row. The meaning is now:
--
--   no cohort                         cohort_only = false (default)
--   joins a cohort                    cohort_only = true  (set by the trigger below)
--   picks "Anyone" on /profile or     cohort_only = false (the picker already writes this)
--   /matches
--
-- Matching is unchanged: resolveCohortOnly (lib/cohort.ts) already stores
-- `has a cohort AND cohort_only`, and the matcher reads that stored value, so
-- nobody's match pool changes when this runs.
--
-- Why a trigger and not just code in the two join paths (cohort signup and code
-- redemption): the old default failed safe. A join path that forgot to set the
-- flag still kept the member inside their cohort. With a default of false, a
-- forgotten path would quietly put a cohort member in the normal pool. The
-- trigger makes "joining a cohort turns it on" true however the cohort gets
-- set, now or in a future flow.
--
-- Trigger rules:
--   INSERT with a cohort                      -> true
--   UPDATE where cohort goes from NULL to     -> true (a choice of "Anyone" is
--     a value                                    made after joining, never in the
--                                                same statement as the join)
--   anything else (changing between          -> untouched, so a member's choice
--     cohorts, clearing a cohort, a plain       of "Anyone" is never overwritten
--     cohort_only update)

alter table postpartumpost.members
  alter column cohort_only set default false;

-- Members with no cohort carry the old default of TRUE. Cohort members keep
-- whatever they have (TRUE by default, FALSE if they chose "Anyone").
update postpartumpost.members
  set cohort_only = false
  where cohort is null and cohort_only is distinct from false;

create or replace function postpartumpost.set_cohort_only_on_join()
returns trigger
language plpgsql
as $$
begin
  if new.cohort is not null then
    if tg_op = 'INSERT' then
      new.cohort_only := true;
    elsif old.cohort is null then
      new.cohort_only := true;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists set_cohort_only_on_join on postpartumpost.members;

create trigger set_cohort_only_on_join
  before insert or update of cohort, cohort_only on postpartumpost.members
  for each row execute function postpartumpost.set_cohort_only_on_join();
