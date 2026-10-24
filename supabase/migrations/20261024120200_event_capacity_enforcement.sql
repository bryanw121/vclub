-- Enforce event capacity in the database.
--
-- Until now the app decided "attending" vs "waitlisted" from its own copy of the
-- roster, so two people tapping Join on the last spot could both get in.
-- This trigger takes a per-event lock, recounts attending players + attending
-- guests, and saves an over-capacity "attending" insert as "waitlisted" instead.
--
-- Inserts only: hosts approving requests or promoting from the waitlist (UPDATEs)
-- can still go over capacity on purpose. Old app versions keep working; the app
-- now reads back the saved status and tells the player if they were waitlisted.

create or replace function public.enforce_event_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap int;
  taken int;
begin
  if NEW.status is distinct from 'attending' then
    return NEW;
  end if;

  select max_attendees into cap from public.events where id = NEW.event_id;
  if cap is null then
    return NEW;  -- unlimited
  end if;

  -- Serialize capacity checks per event so concurrent joins can't both see a free spot.
  perform pg_advisory_xact_lock(hashtextextended('event_capacity:' || NEW.event_id::text, 0));

  select
    (select count(*) from public.event_attendees a where a.event_id = NEW.event_id and a.status = 'attending')
  + (select count(*) from public.event_guests g where g.event_id = NEW.event_id and g.status = 'attending')
  into taken;

  if taken >= cap then
    NEW.status := 'waitlisted';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_event_attendees_capacity on public.event_attendees;
create trigger trg_event_attendees_capacity
  before insert on public.event_attendees
  for each row execute function public.enforce_event_capacity();

drop trigger if exists trg_event_guests_capacity on public.event_guests;
create trigger trg_event_guests_capacity
  before insert on public.event_guests
  for each row execute function public.enforce_event_capacity();
