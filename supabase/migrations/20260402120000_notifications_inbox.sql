-- In-app notification inbox: table, prefs on profiles, RLS, read RPCs, pref helper.
-- Run after event_comments / event_attendees / events / profiles / kudos exist.

-- ─── profiles.notification_prefs (keys mirror notifications.notification_type) ─
alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{"in_app": {}, "push": {}}'::jsonb;

comment on column public.profiles.notification_prefs is
  'Per-channel toggles by notification_type, e.g. {"in_app": {"kudos_received": false}}. Missing keys default to true.';

-- ─── notifications ────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type_check check (
    notification_type in (
      'event_announcement',
      'kudos_received',
      'event_material_change',
      'waitlist_promoted',
      'event_cancelled'
    )
  )
);

create index if not exists notifications_user_id_created_at_desc_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id)
  where read_at is null;

comment on table public.notifications is
  'Per-user inbox rows created by DB triggers; clients read via RLS, never insert directly.';

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (auth.uid() = user_id);

grant select on table public.notifications to authenticated;

revoke insert, update, delete on table public.notifications from authenticated;

-- Optional material-change / cancellation signal on events (safe if already present).
alter table public.events
  add column if not exists cancelled_at timestamptz;

comment on column public.events.cancelled_at is
  'When set, the event is treated as cancelled for notifications and (eventually) product UI.';

-- ─── Pref helper (SECURITY DEFINER for use inside triggers) ──────────────────
create or replace function public.notification_pref_enabled(
  p_user_id uuid,
  p_channel text,
  p_notification_type text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
  key text;
begin
  if p_user_id is null then
    return true;
  end if;
  select p.notification_prefs into v
  from public.profiles p
  where p.id = p_user_id;
  if v is null then
    return true;
  end if;
  key := v #>> array[p_channel, p_notification_type];
  if key is null or key = '' then
    return true;
  end if;
  return key::boolean;
end;
$$;

comment on function public.notification_pref_enabled(uuid, text, text) is
  'Returns whether prefs allow a notification channel/type. Missing keys default to true.';

-- ─── Mark read RPCs ───────────────────────────────────────────────────────────
create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id
    and user_id = auth.uid();
end;
$$;

create or replace function public.mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
  set read_at = coalesce(read_at, now())
  where user_id = auth.uid()
    and read_at is null;
end;
$$;

revoke all on function public.mark_notification_read(uuid) from public;
revoke all on function public.mark_all_notifications_read() from public;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
