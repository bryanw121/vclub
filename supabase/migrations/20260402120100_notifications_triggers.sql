-- Fan-out triggers for notifications (SECURITY DEFINER). Depends on 20260402120000_notifications_inbox.sql
--
-- If `public.kudos` did not exist when this ran, recreate the kudos trigger later after the table exists
-- (re-run the DO block that creates trg_kudos_received, or add a new migration).

-- ─── Host announcement on event discussion ───────────────────────────────────
create or replace function public.notify_on_event_announcement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(NEW.is_announcement, false) then
    return NEW;
  end if;

  insert into public.notifications (user_id, notification_type, title, body, data)
  select
    ea.user_id,
    'event_announcement',
    coalesce(e.title, 'Event') || ': announcement',
    left(NEW.body, 280),
    jsonb_build_object(
      'event_id', NEW.event_id,
      'comment_id', NEW.id,
      'deep_link', '/event/' || NEW.event_id::text
    )
  from public.event_attendees ea
  join public.events e on e.id = ea.event_id
  where ea.event_id = NEW.event_id
    and ea.status = 'attending'
    and ea.user_id is distinct from NEW.user_id
    and public.notification_pref_enabled(ea.user_id, 'in_app', 'event_announcement');

  return NEW;
end;
$$;

drop trigger if exists trg_event_comments_announcement on public.event_comments;
create trigger trg_event_comments_announcement
  after insert on public.event_comments
  for each row
  execute procedure public.notify_on_event_announcement();

-- ─── Kudos received ───────────────────────────────────────────────────────────
create or replace function public.notify_on_kudo_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  giver_username text;
  evt_title text;
begin
  if NEW.receiver_id = NEW.giver_id then
    return NEW;
  end if;

  if not public.notification_pref_enabled(NEW.receiver_id, 'in_app', 'kudos_received') then
    return NEW;
  end if;

  select p.username into giver_username from public.profiles p where p.id = NEW.giver_id;
  select e.title into evt_title from public.events e where e.id = NEW.event_id;

  insert into public.notifications (user_id, notification_type, title, body, data)
  values (
    NEW.receiver_id,
    'kudos_received',
    'You received kudos',
    coalesce(giver_username, 'Someone') || ' gave you ' || replace(NEW.kudo_type::text, '_', ' ') || ' kudos'
      || case when evt_title is not null then ' · ' || left(evt_title, 80) else '' end,
    jsonb_build_object(
      'event_id', NEW.event_id,
      'kudo_id', NEW.id,
      'deep_link', '/event/' || NEW.event_id::text
    )
  );

  return NEW;
end;
$$;

do $$
begin
  if to_regclass('public.kudos') is not null then
    execute 'drop trigger if exists trg_kudos_received on public.kudos';
    execute 'create trigger trg_kudos_received after insert on public.kudos for each row execute procedure public.notify_on_kudo_received()';
  end if;
end;
$$;

-- ─── Event time / place / title / capacity / duration / cancellation ─────────
create or replace function public.notify_on_event_material_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  became_cancelled boolean;
  material_else boolean;
  notif_type text;
  notif_title text;
  notif_body text;
begin
  became_cancelled := NEW.cancelled_at is not null and OLD.cancelled_at is null;

  material_else :=
       OLD.title is distinct from NEW.title
    or OLD.event_date is distinct from NEW.event_date
    or OLD.location is distinct from NEW.location
    or OLD.max_attendees is distinct from NEW.max_attendees
    or OLD.duration_minutes is distinct from NEW.duration_minutes;

  if became_cancelled then
    notif_type := 'event_cancelled';
    notif_title := coalesce(NEW.title, 'Event') || ' cancelled';
    notif_body := 'This event was cancelled by the host.';
  elsif material_else then
    notif_type := 'event_material_change';
    notif_title := coalesce(NEW.title, 'Event') || ' updated';
    notif_body := 'Details changed — open the event to see what''s new.';
  else
    return NEW;
  end if;

  insert into public.notifications (user_id, notification_type, title, body, data)
  select
    ea.user_id,
    notif_type,
    notif_title,
    notif_body,
    jsonb_build_object(
      'event_id', NEW.id,
      'deep_link', '/event/' || NEW.id::text
    )
  from public.event_attendees ea
  where ea.event_id = NEW.id
    and ea.status = 'attending'
    and ea.user_id is distinct from auth.uid()
    and public.notification_pref_enabled(ea.user_id, 'in_app', notif_type);

  return NEW;
end;
$$;

drop trigger if exists trg_events_material_change on public.events;
create trigger trg_events_material_change
  after update on public.events
  for each row
  execute procedure public.notify_on_event_material_change();

-- ─── Waitlist → attending ────────────────────────────────────────────────────
create or replace function public.notify_on_waitlist_promoted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (OLD.status = 'waitlisted' and NEW.status = 'attending') then
    return NEW;
  end if;

  if not public.notification_pref_enabled(NEW.user_id, 'in_app', 'waitlist_promoted') then
    return NEW;
  end if;

  insert into public.notifications (user_id, notification_type, title, body, data)
  select
    NEW.user_id,
    'waitlist_promoted',
    coalesce(e.title, 'Event') || ': you''re in!',
    'You moved off the waitlist — see you at the event.',
    jsonb_build_object(
      'event_id', NEW.event_id,
      'deep_link', '/event/' || NEW.event_id::text
    )
  from public.events e
  where e.id = NEW.event_id;

  return NEW;
end;
$$;

drop trigger if exists trg_event_attendees_waitlist_promoted on public.event_attendees;
create trigger trg_event_attendees_waitlist_promoted
  after update on public.event_attendees
  for each row
  execute procedure public.notify_on_waitlist_promoted();
