-- Enforce events.requires_approval in the database.
--
-- The app sends "Request to Join" (status 'requested') on approval-gated events,
-- but RLS let any signed-in user insert their own row as 'attending' directly.
-- This BEFORE INSERT trigger refuses a self-join as 'attending' on a gated event
-- unless the joiner is the host or a co-host. Unaffected:
--   - 'requested' / 'waitlisted' rows (the host still promotes or approves them;
--     only the host can UPDATE event_attendees under RLS),
--   - rows a host inserts for someone else, and service-role writes (auth.uid() null).
-- Fires before trg_event_attendees_capacity (triggers run in name order), so it
-- judges the status the client asked for.
-- Idempotent: CREATE OR REPLACE + conditional CREATE TRIGGER.

create or replace function public.enforce_event_join_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if NEW.status is distinct from 'attending' or v_uid is null or v_uid <> NEW.user_id then
    return NEW;
  end if;
  if exists (
    select 1 from public.events e
    where e.id = NEW.event_id
      and e.requires_approval
      and e.created_by <> v_uid
      and not exists (
        select 1 from public.event_cohosts c where c.event_id = e.id and c.user_id = v_uid
      )
  ) then
    raise exception 'This event needs host approval: send a join request instead'
      using errcode = '42501';
  end if;
  return NEW;
end;
$$;

revoke all on function public.enforce_event_join_approval() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_event_attendees_approval'
      and tgrelid = 'public.event_attendees'::regclass
  ) then
    create trigger trg_event_attendees_approval
      before insert on public.event_attendees
      for each row execute function public.enforce_event_join_approval();
  end if;
end;
$$;
