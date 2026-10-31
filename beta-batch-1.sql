-- vteam: BETA (CI) database only, project uifolvbwtrbcmfrvelnl. Do NOT run on live.
-- Tests 11 pending PR migrations through beta's ledger (beta_meta.apply_pr_migration).

-- ===== apply100.sql
select beta_meta.apply_pr_migration(100, '20261028170000_points_ledger.sql', $up$-- Points (#4): a ledger of point changes plus a maintained per-user balance.
--
--   point_events    append-only ledger. One row per change: +2 / +5 for
--                   attending, later negative rows for spending (reason
--                   'redeem_ad_free'). Written only by SECURITY DEFINER server
--                   functions: clients have no INSERT/UPDATE/DELETE grant.
--                   unique (user_id, event_id, reason) and
--                   unique (user_id, tournament_id, reason) make awards
--                   idempotent: an event can never award a user twice.
--   point_balances  user_id -> balance, kept by an AFTER INSERT trigger on the
--                   ledger, so a profile reads its total with one PK lookup.
--                   balance >= 0 is a CHECK, so a spend that would go negative
--                   fails and rolls back its ledger row. Public (guests see
--                   points on profiles), read-only for clients.
--
-- Awards (award_event_points(), pg_cron every 15 minutes, idempotent):
--   events       once event_date + duration_minutes has passed (and the event
--                is not cancelled), every attendee whose status is still
--                'attending' gets 5 points if the event is tagged Tournament
--                (tags.category = 'event_type'), otherwise 2 (Open Play and
--                untagged events). Waitlisted, requested and denied attendees
--                get nothing; people who left have no row and get nothing.
--   tournaments  once a tournament is 'completed' (not cancelled), members of
--                approved, registered teams get 5 points.
--   Past events are awarded on the first run (people really attended them).
--
-- Harmless on beta: beta has no real users, so the same cron job runs there
-- (the drift check needs the job on both projects) and at most awards the e2e
-- accounts.
--
-- The ledger is append-only: there is no delete trigger, so deleting rows
-- (only possible as the owner, e.g. a cascading account deletion, which also
-- deletes the balance row) never re-computes or blocks on the balance.

create table if not exists public.point_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null check (amount <> 0),
  reason text not null check (reason ~ '^[a-z][a-z0-9_]{0,63}$'),
  event_id uuid references public.events (id) on delete set null,
  tournament_id uuid references public.tournaments (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint point_events_once_per_event unique (user_id, event_id, reason),
  constraint point_events_once_per_tournament unique (user_id, tournament_id, reason)
);

create index if not exists point_events_event_id_idx on public.point_events (event_id) where event_id is not null;
create index if not exists point_events_tournament_id_idx on public.point_events (tournament_id) where tournament_id is not null;

create table if not exists public.point_balances (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

alter table public.point_events enable row level security;
alter table public.point_balances enable row level security;

-- Read-only for clients. Supabase grants everything on new public tables by
-- default, so revoke first.
revoke all on public.point_events from anon, authenticated;
revoke all on public.point_balances from anon, authenticated;
grant select on public.point_events to authenticated;
grant select on public.point_balances to anon, authenticated;

drop policy if exists "Users read their own point history" on public.point_events;
create policy "Users read their own point history" on public.point_events
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Anyone reads point balances" on public.point_balances;
create policy "Anyone reads point balances" on public.point_balances
  for select to anon, authenticated
  using (true);

-- Keep point_balances in step with the ledger.
create or replace function public.apply_point_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.point_balances (user_id, balance, updated_at)
  values (new.user_id, new.amount, now())
  on conflict (user_id) do update
    set balance = public.point_balances.balance + excluded.balance,
        updated_at = now();
  return null;
end;
$$;

revoke all on function public.apply_point_event() from public, anon, authenticated;

drop trigger if exists point_events_apply on public.point_events;
create trigger point_events_apply
  after insert on public.point_events
  for each row execute function public.apply_point_event();

-- The award pass. Returns how many ledger rows it inserted.
create or replace function public.award_event_points()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_rows integer := 0;
  tournament_rows integer := 0;
begin
  insert into public.point_events (user_id, amount, reason, event_id)
  select ea.user_id,
         case when exists (
           select 1 from public.event_tags et
           join public.tags t on t.id = et.tag_id
           where et.event_id = e.id and t.category = 'event_type' and t.name = 'Tournament'
         ) then 5 else 2 end,
         'event_attended',
         e.id
  from public.events e
  join public.event_attendees ea on ea.event_id = e.id and ea.status = 'attending'
  where e.cancelled_at is null
    and e.event_date + make_interval(mins => e.duration_minutes) <= now()
    -- someone added after the end did not attend
    and (ea.joined_at is null or ea.joined_at <= e.event_date + make_interval(mins => e.duration_minutes))
    and not exists (
      select 1 from public.point_events pe
      where pe.user_id = ea.user_id and pe.event_id = e.id and pe.reason = 'event_attended'
    )
  on conflict do nothing;
  get diagnostics event_rows = row_count;

  insert into public.point_events (user_id, amount, reason, tournament_id)
  select distinct m.user_id, 5, 'tournament_played', t.id
  from public.tournaments t
  join public.tournament_teams tt on tt.tournament_id = t.id and tt.status = 'registered' and tt.is_approved
  join public.tournament_team_members m on m.team_id = tt.id
  where t.status = 'completed'
    and t.cancelled_at is null
    and not exists (
      select 1 from public.point_events pe
      where pe.user_id = m.user_id and pe.tournament_id = t.id and pe.reason = 'tournament_played'
    )
  on conflict do nothing;
  get diagnostics tournament_rows = row_count;

  return event_rows + tournament_rows;
end;
$$;

revoke all on function public.award_event_points() from public, anon, authenticated;

comment on function public.award_event_points() is
  'Awards attendance points (2 open play / 5 tournament) for ended events and completed tournaments. Idempotent; run by pg_cron award-event-points.';

do $$
begin
  if exists (select 1 from cron.job where jobname = 'award-event-points') then
    perform cron.unschedule('award-event-points');
  end if;
  perform cron.schedule('award-event-points', '7,22,37,52 * * * *', $job$select public.award_event_points()$job$);
end $$;
$up$, $down$-- Undo 20261028170000_points_ledger.sql.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'award-event-points') then
    perform cron.unschedule('award-event-points');
  end if;
end $$;
drop function if exists public.award_event_points();
drop trigger if exists point_events_apply on public.point_events;
drop function if exists public.apply_point_event();
drop table if exists public.point_balances;
drop table if exists public.point_events;
$down$);

-- ===== apply101.sql
select beta_meta.apply_pr_migration(101, '20261028170100_ads.sql', $up$-- Ads (#5): house banners and sponsored events, no ad network.
--
--   ad_banners        admin-managed house banners shown in the Events feed at
--                     a fixed cadence (constants/ads.ts). Everyone (guests
--                     too) reads the active ones: is_active and inside
--                     [starts_at, ends_at). Admins read and write all rows.
--   sponsored_events  event_id -> sponsorship window. A sponsored event gets a
--                     "Sponsored" label in the feed and one promoted slot.
--                     A separate table rather than an events column, so hosts
--                     (who may update their own events) can never set it, and
--                     the feed RPC / event selects stay untouched.
--
-- Admin = profiles.is_admin of auth.uid(), checked server-side by
-- current_user_is_admin() (SECURITY DEFINER, so it works even when is_admin is
-- not readable through the API). Admins manage rows with SQL or the dashboard
-- for now (see CLAUDE.md "Ads").

create or replace function public.current_user_is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- #102 moves admins from profiles.is_admin to public.app_admins (and forces
  -- the column to false). Check whichever exists, so this works in either
  -- merge order; plpgsql only plans the branch it runs.
  if to_regclass('public.app_admins') is not null then
    return exists (select 1 from public.app_admins a where a.user_id = (select auth.uid()));
  end if;
  return coalesce((select p.is_admin from public.profiles p where p.id = (select auth.uid())), false);
end;
$$;

revoke all on function public.current_user_is_admin() from public, anon;
grant execute on function public.current_user_is_admin() to authenticated;

create table if not exists public.ad_banners (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  body text check (body is null or char_length(body) <= 140),
  image_url text check (image_url is null or image_url ~ '^https://'),
  link_url text not null check (link_url ~ '^https://'),
  is_active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  display_order integer not null default 0,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ad_banners_window check (ends_at is null or ends_at > starts_at)
);

create index if not exists ad_banners_created_by_idx on public.ad_banners (created_by);

create table if not exists public.sponsored_events (
  event_id uuid primary key references public.events (id) on delete cascade,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint sponsored_events_window check (ends_at is null or ends_at > starts_at)
);

create index if not exists sponsored_events_created_by_idx on public.sponsored_events (created_by);

alter table public.ad_banners enable row level security;
alter table public.sponsored_events enable row level security;

revoke all on public.ad_banners from anon, authenticated;
revoke all on public.sponsored_events from anon, authenticated;
grant select on public.ad_banners to anon, authenticated;
grant select on public.sponsored_events to anon, authenticated;
grant insert, update, delete on public.ad_banners to authenticated;
grant insert, update, delete on public.sponsored_events to authenticated;

drop policy if exists "Anyone reads active banners" on public.ad_banners;
create policy "Anyone reads active banners" on public.ad_banners
  for select to anon, authenticated
  using (is_active and starts_at <= now() and (ends_at is null or ends_at > now()));

drop policy if exists "Admins manage banners" on public.ad_banners;
create policy "Admins manage banners" on public.ad_banners
  for all to authenticated
  using ((select public.current_user_is_admin()))
  with check ((select public.current_user_is_admin()));

drop policy if exists "Anyone reads active sponsorships" on public.sponsored_events;
create policy "Anyone reads active sponsorships" on public.sponsored_events
  for select to anon, authenticated
  using (starts_at <= now() and (ends_at is null or ends_at > now()));

drop policy if exists "Admins manage sponsorships" on public.sponsored_events;
create policy "Admins manage sponsorships" on public.sponsored_events
  for all to authenticated
  using ((select public.current_user_is_admin()))
  with check ((select public.current_user_is_admin()));
$up$, $down$-- Undo 20261028170100_ads.sql.
drop table if exists public.sponsored_events;
drop table if exists public.ad_banners;
drop function if exists public.current_user_is_admin();
$down$);

-- ===== apply103.sql
select beta_meta.apply_pr_migration(103, '20261028170200_ad_free_redeem.sql', $up$-- Spend points to remove ads (#14).
--
--   ad_free_offer()        the one place the price lives: 100 points buys 30
--                          days. The app shows whatever this returns.
--   ad_free_passes         user_id -> ad_free_until. Owner-only SELECT, no
--                          client writes (user_settings is client-writable,
--                          so the entitlement can't live there).
--   get_ad_free_status()   the caller's balance, ad_free_until and the offer,
--                          in one call (settings screen + useAdsEnabled).
--   redeem_ad_free()       atomically debits the offer's cost from the ledger
--                          (point_events row, reason 'redeem_ad_free') and
--                          extends ad_free_until by the offer's days, from the
--                          current expiry when one is still running, else from
--                          now. An insufficient balance returns ok = false and
--                          changes nothing.
--
-- Double-spend safety: redeem takes a per-user transaction advisory lock (so
-- two concurrent redemptions run one after the other, even before the user has
-- a balance row), then locks the balance row FOR UPDATE and re-reads it. The
-- balance >= 0 CHECK on point_balances is the last line of defence.

create or replace function public.ad_free_offer()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('cost', 100, 'days', 30)
$$;

grant execute on function public.ad_free_offer() to anon, authenticated;

create table if not exists public.ad_free_passes (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  ad_free_until timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.ad_free_passes enable row level security;
revoke all on public.ad_free_passes from anon, authenticated;
grant select on public.ad_free_passes to authenticated;

drop policy if exists "Users read their own ad-free pass" on public.ad_free_passes;
create policy "Users read their own ad-free pass" on public.ad_free_passes
  for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.get_ad_free_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.ad_free_offer() || jsonb_build_object(
    'balance', coalesce((select b.balance from public.point_balances b where b.user_id = (select auth.uid())), 0),
    'ad_free_until', (select p.ad_free_until from public.ad_free_passes p where p.user_id = (select auth.uid()))
  )
$$;

revoke all on function public.get_ad_free_status() from public, anon;
grant execute on function public.get_ad_free_status() to authenticated;

create or replace function public.redeem_ad_free()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  offer jsonb := public.ad_free_offer();
  v_cost integer := (offer->>'cost')::integer;
  v_days integer := (offer->>'days')::integer;
  current_balance integer;
  current_until timestamptz;
  new_until timestamptz;
begin
  if uid is null then
    raise exception 'Sign in to redeem points' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('redeem_ad_free:' || uid::text, 0));

  select b.balance into current_balance
  from public.point_balances b
  where b.user_id = uid
  for update;
  current_balance := coalesce(current_balance, 0);

  select p.ad_free_until into current_until
  from public.ad_free_passes p
  where p.user_id = uid;

  if current_balance < v_cost then
    return offer || jsonb_build_object('ok', false, 'reason', 'insufficient_points',
      'balance', current_balance, 'ad_free_until', current_until);
  end if;

  insert into public.point_events (user_id, amount, reason)
  values (uid, -v_cost, 'redeem_ad_free');

  new_until := greatest(coalesce(current_until, now()), now()) + make_interval(days => v_days);

  insert into public.ad_free_passes (user_id, ad_free_until, updated_at)
  values (uid, new_until, now())
  on conflict (user_id) do update
    set ad_free_until = excluded.ad_free_until, updated_at = now();

  return offer || jsonb_build_object('ok', true, 'balance', current_balance - v_cost, 'ad_free_until', new_until);
end;
$$;

revoke all on function public.redeem_ad_free() from public, anon;
grant execute on function public.redeem_ad_free() to authenticated;
$up$, $down$-- Undo 20261028170200_ad_free_redeem.sql.
drop function if exists public.redeem_ad_free();
drop function if exists public.get_ad_free_status();
drop table if exists public.ad_free_passes;
drop function if exists public.ad_free_offer();
$down$);

-- ===== beta-apply-1-pr102-20261028120000_privacy_private_reads.sql
select beta_meta.apply_pr_migration(102, '20261028120000_privacy_private_reads.sql', $up$-- #99 part 1: narrow what signed-out visitors and other users can read.
--
-- Expand-safe on purpose: installed native builds (some still `select('*')`
-- from profiles) keep working, because no column they read disappears or
-- loses its grant. Private values move OUT of the publicly readable columns
-- into owner-only places, and triggers keep old clients' writes landing there.
-- A later contract PR can drop profiles.notification_prefs / is_admin and
-- event_attendees.denial_reason once no deployed build reads them.
--
--  1. profiles.notification_prefs -> user_settings.notification_prefs (owner-only RLS)
--  2. profiles.is_admin           -> app_admins (no client access) + is_app_admin()
--  3. event_attendees.denial_reason -> event_attendee_denials (host, co-hosts, that attendee)
--  4. event_guests: signed-out visitors no longer read +1 names; headcounts
--     still work through event_guests_attending (no names)
--  5. cheers: signed-out visitors no longer see who gave a kudo (giver_id)
--  6. chat-images bucket private; only the uploader and members of a
--     conversation holding the image can read (signed URLs)

-- ─── 1. notification_prefs ───────────────────────────────────────────────────

alter table public.user_settings add column if not exists notification_prefs jsonb;

insert into public.user_settings (user_id, notification_prefs)
select p.id, p.notification_prefs
from public.profiles p
join auth.users u on u.id = p.id
where p.notification_prefs is distinct from '{"push": {}, "in_app": {}}'::jsonb
on conflict (user_id) do update set notification_prefs = excluded.notification_prefs, updated_at = now();

-- ─── 2. is_admin ─────────────────────────────────────────────────────────────

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
-- No policies: only SECURITY DEFINER functions and the service role read it.
revoke all on public.app_admins from anon, authenticated;

insert into public.app_admins (user_id)
select p.id from public.profiles p join auth.users u on u.id = p.id where p.is_admin
on conflict do nothing;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins a where a.user_id = (select auth.uid()))
$$;
revoke execute on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;

drop policy if exists "Admins insert clubs" on public.clubs;
create policy "Admins insert clubs" on public.clubs
  for insert to public
  with check ((select public.is_app_admin()));

-- Old clients may still write these columns: move a written value to its
-- private home and keep the public column at its default.
create or replace function public.profiles_keep_private_columns_private()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.notification_prefs is distinct from '{"push": {}, "in_app": {}}'::jsonb then
    if tg_op = 'INSERT' or new.notification_prefs is distinct from old.notification_prefs then
      insert into public.user_settings (user_id, notification_prefs)
      values (new.id, new.notification_prefs)
      on conflict (user_id) do update set notification_prefs = excluded.notification_prefs, updated_at = now();
    end if;
    new.notification_prefs := '{"push": {}, "in_app": {}}'::jsonb;
  end if;
  -- Admins live in app_admins; this column is never true again.
  new.is_admin := false;
  return new;
end;
$$;
revoke execute on function public.profiles_keep_private_columns_private() from public, anon, authenticated;

drop trigger if exists trg_profiles_keep_private_columns_private on public.profiles;
create trigger trg_profiles_keep_private_columns_private
  before insert or update on public.profiles
  for each row execute function public.profiles_keep_private_columns_private();

-- Fires the trigger above, which resets both columns.
update public.profiles
set notification_prefs = '{"push": {}, "in_app": {}}'::jsonb
where notification_prefs is distinct from '{"push": {}, "in_app": {}}'::jsonb or is_admin;

-- Notification triggers read the private copy (profiles is kept as a fallback
-- for the moment between this migration and the backfill above).
create or replace function public.notification_pref_enabled(p_user_id uuid, p_channel text, p_notification_type text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v jsonb;
  key text;
begin
  if p_user_id is null then
    return true;
  end if;
  select s.notification_prefs into v from public.user_settings s where s.user_id = p_user_id;
  if v is null then
    select p.notification_prefs into v from public.profiles p where p.id = p_user_id;
  end if;
  if v is null then
    return true;
  end if;
  key := v #>> array[p_channel, p_notification_type];
  if key is null or key = '' then
    return true;
  end if;
  return key::boolean;
end;
$function$;

-- ─── 3. denial_reason ────────────────────────────────────────────────────────

create table if not exists public.event_attendee_denials (
  event_id uuid not null,
  user_id uuid not null,
  reason text not null check (char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id),
  -- Deferred so the BEFORE INSERT trigger below can record a reason for a row
  -- that is being inserted in the same statement.
  constraint event_attendee_denials_attendee_fkey foreign key (event_id, user_id)
    references public.event_attendees (event_id, user_id) on delete cascade
    deferrable initially deferred
);
alter table public.event_attendee_denials enable row level security;
revoke all on public.event_attendee_denials from anon, authenticated;
grant select on public.event_attendee_denials to authenticated;

drop policy if exists "Denial reason visible to host, co-hosts and the attendee" on public.event_attendee_denials;
create policy "Denial reason visible to host, co-hosts and the attendee" on public.event_attendee_denials
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.events e where e.id = event_attendee_denials.event_id and e.created_by = (select auth.uid()))
    or exists (select 1 from public.event_cohosts c where c.event_id = event_attendee_denials.event_id and c.user_id = (select auth.uid()))
  );

insert into public.event_attendee_denials (event_id, user_id, reason)
select a.event_id, a.user_id, left(btrim(a.denial_reason), 500)
from public.event_attendees a
where a.status = 'denied' and nullif(btrim(a.denial_reason), '') is not null
on conflict (event_id, user_id) do update set reason = excluded.reason;

create or replace function public.event_attendees_keep_denial_private()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'denied' and nullif(btrim(new.denial_reason), '') is not null then
    insert into public.event_attendee_denials (event_id, user_id, reason)
    values (new.event_id, new.user_id, left(btrim(new.denial_reason), 500))
    on conflict (event_id, user_id) do update set reason = excluded.reason, created_at = now();
  elsif tg_op = 'UPDATE' and new.status is distinct from 'denied' then
    delete from public.event_attendee_denials d where d.event_id = new.event_id and d.user_id = new.user_id;
  end if;
  new.denial_reason := null;
  return new;
end;
$$;
revoke execute on function public.event_attendees_keep_denial_private() from public, anon, authenticated;

drop trigger if exists trg_event_attendees_keep_denial_private on public.event_attendees;
create trigger trg_event_attendees_keep_denial_private
  before insert or update on public.event_attendees
  for each row execute function public.event_attendees_keep_denial_private();

update public.event_attendees set denial_reason = null where denial_reason is not null;

-- ─── 4. event_guests ─────────────────────────────────────────────────────────

-- +1 rows (with names) only for signed-in users.
drop policy if exists "Anyone can view guests" on public.event_guests;
create policy "Anyone can view guests" on public.event_guests
  for select to authenticated
  using (true);

-- Headcounts for everyone, without names. Not security_invoker: it has to
-- count rows that the base table's RLS now hides from signed-out visitors.
drop view if exists public.event_guests_attending;
create view public.event_guests_attending as
  select id, event_id, added_by, status, joined_at, team_number, team_pinned
  from public.event_guests
  where status = 'attending';
revoke all on public.event_guests_attending from anon, authenticated;
grant select on public.event_guests_attending to anon, authenticated, service_role;

-- ─── 5. cheers ───────────────────────────────────────────────────────────────

revoke select on public.cheers from anon;
grant select (id, event_id, receiver_id, cheer_type, created_at) on public.cheers to anon;

-- ─── 6. chat-images ──────────────────────────────────────────────────────────

-- Uploader, or a member of a conversation with a message whose sender uploaded
-- this object and that references it (new rows store the object path; older
-- rows store the former public URL).
create or replace function public.can_read_chat_image(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    split_part(p_name, '/', 1) = (select auth.uid())::text
    or exists (
      select 1
      from public.messages m
      join public.conversation_members cm
        on cm.conversation_id = m.conversation_id and cm.user_id = (select auth.uid())
      where m.sender_id::text = split_part(p_name, '/', 1)
        and (m.image_url = p_name or right(m.image_url, length(p_name) + 13) = '/chat-images/' || p_name)
    )
  )
$$;
revoke execute on function public.can_read_chat_image(text) from public, anon;
grant execute on function public.can_read_chat_image(text) to authenticated;

create index if not exists messages_image_url_idx on public.messages (image_url) where image_url is not null;

drop policy if exists chat_images_select_authenticated on storage.objects;
create policy chat_images_select_authenticated on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-images' and public.can_read_chat_image(name));

update storage.buckets set public = false where id = 'chat-images';
$up$, $down$-- Undo 20261028120000_privacy_private_reads.sql exactly, copying the moved
-- values back to their original columns first.

-- 6. chat-images
update storage.buckets set public = true where id = 'chat-images';
drop policy if exists chat_images_select_authenticated on storage.objects;
create policy chat_images_select_authenticated on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-images');
drop index if exists public.messages_image_url_idx;
drop function if exists public.can_read_chat_image(text);

-- 5. cheers
revoke select (id, event_id, receiver_id, cheer_type, created_at) on public.cheers from anon;
grant select on public.cheers to anon;

-- 4. event_guests
drop view if exists public.event_guests_attending;
create view public.event_guests_attending with (security_invoker = true) as
  select id, event_id, added_by, first_name, last_name, status, joined_at
  from public.event_guests
  where status = 'attending';
grant all on public.event_guests_attending to anon, authenticated, service_role;
drop policy if exists "Anyone can view guests" on public.event_guests;
create policy "Anyone can view guests" on public.event_guests
  for select to public
  using (true);

-- 3. denial_reason
drop trigger if exists trg_event_attendees_keep_denial_private on public.event_attendees;
drop function if exists public.event_attendees_keep_denial_private();
update public.event_attendees a
set denial_reason = d.reason
from public.event_attendee_denials d
where d.event_id = a.event_id and d.user_id = a.user_id;
drop table if exists public.event_attendee_denials;

-- 1 + 2. profiles
drop trigger if exists trg_profiles_keep_private_columns_private on public.profiles;
drop function if exists public.profiles_keep_private_columns_private();
update public.profiles p
set notification_prefs = s.notification_prefs
from public.user_settings s
where s.user_id = p.id and s.notification_prefs is not null;
update public.profiles p set is_admin = true from public.app_admins a where a.user_id = p.id;

create or replace function public.notification_pref_enabled(p_user_id uuid, p_channel text, p_notification_type text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
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
$function$;

drop policy if exists "Admins insert clubs" on public.clubs;
create policy "Admins insert clubs" on public.clubs
  for insert to public
  with check (( SELECT profiles.is_admin FROM profiles WHERE (profiles.id = ( SELECT auth.uid() AS uid))));

drop function if exists public.is_app_admin();
drop table if exists public.app_admins;
alter table public.user_settings drop column if exists notification_prefs;
$down$);

-- ===== beta-apply-2-pr102-20261028120200_rate_limit_core.sql
select beta_meta.apply_pr_migration(102, '20261028120200_rate_limit_core.sql', $up$-- Rate limiting core (moved here from #108 so #102's login-with-username can
-- use it; #108 adds the triggers and RPC limits on top).
--
-- A fixed-window counter per key in public.rate_limits. check_rate_limit()
-- counts a hit and says whether the key is still under its limit (edge
-- functions call it with the service role); enforce_rate_limit() raises
-- SQLSTATE PT429, which PostgREST returns as HTTP 429. Both are service-role /
-- definer only.

create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits integer not null default 0
);
alter table public.rate_limits enable row level security;
-- No policies and no client grants: only definer functions and the service role touch it.
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hits integer;
begin
  if p_key is null or p_max is null or p_window_seconds is null or p_max < 1 or p_window_seconds < 1 then
    raise exception 'check_rate_limit: key, max >= 1 and window >= 1 are required';
  end if;
  insert into public.rate_limits as r (key, window_start, hits)
  values (left(p_key, 200), now(), 1)
  on conflict (key) do update set
    window_start = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then now() else r.window_start end,
    hits = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end
  returning hits into v_hits;
  return v_hits <= p_max;
end;
$$;
revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

create or replace function public.enforce_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.check_rate_limit(p_key, p_max, p_window_seconds) then
    raise exception using
      errcode = 'PT429',
      message = 'Too many requests. Please wait a moment and try again.',
      hint = format('Limit is %s per %s seconds.', p_max, p_window_seconds);
  end if;
end;
$$;
revoke execute on function public.enforce_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.enforce_rate_limit(text, integer, integer) to service_role;

-- Old counters are useless after their window; keep the table small.
select cron.schedule('prune-rate-limits', '41 * * * *', $cron$delete from public.rate_limits where window_start < now() - interval '1 day'$cron$);
$up$, $down$-- Undo 20261028120200_rate_limit_core.sql.
select cron.unschedule('prune-rate-limits') where exists (select 1 from cron.job where jobname = 'prune-rate-limits');
drop function if exists public.enforce_rate_limit(text, integer, integer);
drop function if exists public.check_rate_limit(text, integer, integer);
drop table if exists public.rate_limits;
$down$);

-- ===== beta-apply-3-pr102-20261028120300_conversation_members_insert.sql
select beta_meta.apply_pr_migration(102, '20261028120300_conversation_members_insert.sql', $up$-- #99 review: anyone signed in could add themselves to any conversation whose
-- id they knew ("Can insert self as member" only checked user_id = auth.uid()),
-- and then read its messages and chat images.
--
-- contract: no app version has ever inserted into conversation_members directly
-- (git history of app/, hooks/, components/, lib/); every join goes through a
-- SECURITY DEFINER function (find_or_create_dm, create_club_conversation,
-- auto_join_club_conversation), which RLS does not apply to.
drop policy if exists "Can insert self as member" on public.conversation_members;
$up$, $down$-- Undo 20261028120300_conversation_members_insert.sql.
create policy "Can insert self as member" on public.conversation_members
  for insert to authenticated
  with check (user_id = ( SELECT auth.uid() AS uid));
$down$);

-- ===== beta-apply-5-pr106-20261028130000_account_deletion.sql
select beta_meta.apply_pr_migration(106, '20261028130000_account_deletion.sql', $up$-- #99 part 2: in-app account deletion.
--
-- Flow: the app shows get_account_deletion_preview() (what will be deleted and
-- what will be handed to whom, plus a hash of that plan). The delete-account
-- edge function checks the person signed in recently, then calls
-- delete_account(user, hash) with the service role. That one transaction locks
-- the person's profile, recomputes the plan, aborts if it differs from what was
-- shown, carries it out, and deletes the auth user (cascading to profiles and
-- everything keyed on it). Nothing is half-done: it all commits or nothing does.
--
-- Rules (preview and execution both come from account_deletion_plan):
--   clubs the person created, or where they are the only owner
--                              -> the earliest other OWNER (club_members.role) who is not
--                                 also being deleted; else the club is deleted with its
--                                 group chat, posts and tournaments (finished ones too)
--   tournaments they created   -> an owner of the tournament's club (same rule); else deleted
--   upcoming events they host  -> their earliest co-host; else cancelled (attendees get the
--                                 usual "event cancelled" notification)
--   past events they hosted    -> kept, host removed (events.created_by = null)
--   kudos they gave            -> kept for the recipients, giver removed (cheers.giver_id = null)
--   tournament captaincies     -> next team member, else the team has no captain
--   co-hosts they added        -> recorded as added by the co-host themself
--   tournament comments, team memberships, invitations, join requests -> deleted
--   everything else (messages, comments, RSVPs, settings, tokens...) goes with the
--   existing ON DELETE CASCADE / SET NULL foreign keys.

-- Kudos stay with the people who received them (the giver is never shown by name).
alter table public.cheers alter column giver_id drop not null;
alter table public.cheers drop constraint if exists kudos_giver_id_fkey;
alter table public.cheers add constraint kudos_giver_id_fkey
  foreign key (giver_id) references public.profiles(id) on delete set null;

-- True while another transaction is deleting this account: delete_account
-- holds a FOR UPDATE lock on the profile row. FOR KEY SHARE does not conflict
-- with ordinary profile updates, only with that lock, so SKIP LOCKED finds
-- nothing exactly when a deletion is in progress (or the profile is gone).
create or replace function public.account_is_being_deleted(p_user uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return not exists (select 1 from public.profiles p where p.id = p_user for key share skip locked);
end;
$$;
revoke execute on function public.account_is_being_deleted(uuid) from public, anon, authenticated;

-- Earliest owner of a club other than p_user who is not being deleted.
create or replace function public.club_successor(p_club uuid, p_user uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select m.user_id from public.club_members m
    where m.club_id = p_club and m.role = 'owner' and m.user_id <> p_user
    order by m.joined_at, m.user_id
  loop
    if not public.account_is_being_deleted(r.user_id) then
      return r.user_id;
    end if;
  end loop;
  return null;
end;
$$;
revoke execute on function public.club_successor(uuid, uuid) from public, anon, authenticated;

create or replace function public.account_deletion_plan(p_user uuid)
returns jsonb
language plpgsql
volatile -- locks rows (skip-locked checks) to find successors
security definer
set search_path = ''
as $$
declare
  v_clubs jsonb;
  v_tournaments jsonb;
  v_events jsonb;
  v_past int;
  v_kudos int;
begin
  -- Clubs the person created or is the only owner of.
  with c as (
    select cl.id, cl.name, public.club_successor(cl.id, p_user) as successor
    from public.clubs cl
    where cl.created_by = p_user
       or (exists (select 1 from public.club_members m where m.club_id = cl.id and m.user_id = p_user and m.role = 'owner')
           and not exists (select 1 from public.club_members m where m.club_id = cl.id and m.user_id <> p_user and m.role = 'owner'))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name,
      'action', case when c.successor is null then 'delete' else 'transfer' end,
      'to', case when c.successor is null then null else jsonb_build_object(
        'id', p.id, 'username', p.username, 'first_name', p.first_name, 'last_name', p.last_name) end,
      'members', (select count(*) from public.club_members m where m.club_id = c.id and m.user_id <> p_user),
      'posts', (select count(*) from public.club_posts cp where cp.club_id = c.id),
      'tournaments', (select count(*) from public.tournaments t where t.club_id = c.id),
      'has_chat', exists (select 1 from public.conversations cv where cv.club_id = c.id)
    ) order by c.name, c.id), '[]'::jsonb)
  into v_clubs
  from c left join public.profiles p on p.id = c.successor;

  -- Tournaments: those the person created, plus every tournament in a club
  -- that is about to be deleted (they go with the club, whoever created them).
  with deleted_clubs as (
    select (x->>'id')::uuid as id, x->>'name' as name
    from jsonb_array_elements(v_clubs) x where x->>'action' = 'delete'
  ),
  t as (
    select tr.id, tr.title, tr.status, dc.name as club_name,
      case when dc.id is not null then null else public.club_successor(tr.club_id, p_user) end as successor
    from public.tournaments tr
    left join deleted_clubs dc on dc.id = tr.club_id
    where tr.created_by = p_user or dc.id is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'title', t.title, 'status', t.status,
      'action', case when t.successor is null then 'delete' else 'transfer' end,
      'with_club', t.club_name,
      'to', case when t.successor is null then null else jsonb_build_object(
        'id', p.id, 'username', p.username, 'first_name', p.first_name, 'last_name', p.last_name) end
    ) order by t.title, t.id), '[]'::jsonb)
  into v_tournaments
  from t left join public.profiles p on p.id = t.successor;

  -- Upcoming events they host: earliest co-host takes over, else cancelled.
  with e as (
    select ev.id, ev.title, ev.event_date,
      (select c.user_id from public.event_cohosts c
        where c.event_id = ev.id and c.user_id <> p_user and not public.account_is_being_deleted(c.user_id)
        order by c.added_at, c.user_id limit 1) as successor
    from public.events ev
    where ev.created_by = p_user and ev.cancelled_at is null and ev.event_date > (now() at time zone 'utc')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'title', e.title, 'event_date', e.event_date,
      'action', case when e.successor is null then 'cancel' else 'transfer' end,
      'to', case when e.successor is null then null else jsonb_build_object(
        'id', p.id, 'username', p.username, 'first_name', p.first_name, 'last_name', p.last_name) end
    ) order by e.event_date, e.id), '[]'::jsonb)
  into v_events
  from e left join public.profiles p on p.id = e.successor;

  select count(*) into v_past
  from public.events ev
  where ev.created_by = p_user and (ev.cancelled_at is not null or ev.event_date <= (now() at time zone 'utc'));

  select count(*) into v_kudos from public.cheers k where k.giver_id = p_user;

  return jsonb_build_object(
    'clubs', v_clubs, 'tournaments', v_tournaments, 'events', v_events,
    'past_events_kept', v_past, 'kudos_given_kept', v_kudos);
end;
$$;
revoke execute on function public.account_deletion_plan(uuid) from public, anon, authenticated;

-- What deleting the signed-in account would do (the confirm screen), with a
-- hash the app sends back so delete_account can refuse a stale confirmation.
create or replace function public.get_account_deletion_preview()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_plan jsonb;
begin
  if (select auth.uid()) is null then
    return null;
  end if;
  v_plan := public.account_deletion_plan((select auth.uid()));
  return v_plan || jsonb_build_object('hash', md5(v_plan::text));
end;
$$;
revoke execute on function public.get_account_deletion_preview() from public, anon;
grant execute on function public.get_account_deletion_preview() to authenticated;

-- Delete p_user's account in one transaction. Service role only (the
-- delete-account edge function, after its recent-sign-in check).
-- Raises 'account_deletion_plan_changed' (SQLSTATE P0409) when the plan no
-- longer matches p_plan_hash: the app shows the new plan and asks again.
create or replace function public.delete_account(p_user uuid, p_plan_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan jsonb;
  x jsonb;
  r record;
  v_next uuid;
  v_left text;
begin
  if p_user is null or p_plan_hash is null then
    raise exception 'delete_account: user and plan hash are required';
  end if;

  -- Serialize with any other deletion of this account, and mark it as "being
  -- deleted" for concurrent plans (account_is_being_deleted).
  perform 1 from public.profiles where id = p_user for update;
  if not found then
    raise exception 'delete_account: no such account';
  end if;

  v_plan := public.account_deletion_plan(p_user);
  if md5(v_plan::text) <> p_plan_hash then
    raise exception using errcode = 'P0409', message = 'account_deletion_plan_changed';
  end if;

  for x in select * from jsonb_array_elements(v_plan->'clubs') loop
    if x->>'action' = 'transfer' then
      update public.clubs set created_by = (x->'to'->>'id')::uuid where id = (x->>'id')::uuid;
    else
      delete from public.clubs where id = (x->>'id')::uuid;
    end if;
  end loop;

  for x in select * from jsonb_array_elements(v_plan->'tournaments') loop
    if x->>'action' = 'transfer' then
      update public.tournaments set created_by = (x->'to'->>'id')::uuid where id = (x->>'id')::uuid;
    else
      delete from public.tournaments where id = (x->>'id')::uuid;
    end if;
  end loop;

  for x in select * from jsonb_array_elements(v_plan->'events') loop
    if x->>'action' = 'transfer' then
      update public.events set created_by = (x->'to'->>'id')::uuid where id = (x->>'id')::uuid;
      delete from public.event_cohosts where event_id = (x->>'id')::uuid and user_id = (x->'to'->>'id')::uuid;
    else
      update public.events set cancelled_at = now() where id = (x->>'id')::uuid and cancelled_at is null;
    end if;
  end loop;

  -- Past and cancelled events stay, without a host (events.created_by would
  -- otherwise cascade and delete them for everyone who played).
  update public.events set created_by = null where created_by = p_user;

  update public.event_cohosts set added_by = user_id where added_by = p_user;

  for r in select t.id from public.tournament_teams t where t.captain_user_id = p_user loop
    select m.user_id into v_next from public.tournament_team_members m
      where m.team_id = r.id and m.user_id <> p_user order by m.joined_at, m.user_id limit 1;
    update public.tournament_teams set captain_user_id = v_next where id = r.id;
    if v_next is not null then
      update public.tournament_team_members set is_captain = true where team_id = r.id and user_id = v_next;
    end if;
  end loop;

  delete from public.tournament_team_members where user_id = p_user;
  delete from public.tournament_team_invitations where inviter_id = p_user or invitee_id = p_user;
  delete from public.tournament_team_join_requests where requester_id = p_user;
  delete from public.tournament_comments where user_id = p_user;

  -- Every remaining FK to the person must cascade or set null; fail (and roll
  -- everything back) if a NO ACTION / RESTRICT one still points at them.
  for r in
    select c.conrelid::regclass::text as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and array_length(c.conkey, 1) = 1
      and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
      and c.confdeltype in ('a', 'r')
      and c.connamespace = 'public'::regnamespace
  loop
    execute format('select %I::text from %s where %I = $1 limit 1', r.col, r.tbl, r.col) into v_left using p_user;
    if v_left is not null then
      raise exception 'delete_account: %.% still references the user', r.tbl, r.col;
    end if;
  end loop;

  -- Last: the auth user. Cascades to profiles (and from there to everything
  -- keyed on the person) and to auth sessions / identities.
  delete from auth.users where id = p_user;

  return v_plan;
end;
$$;
revoke execute on function public.delete_account(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_account(uuid, text) to service_role;
$up$, $down$-- Undo 20261028130000_account_deletion.sql.
drop function if exists public.delete_account(uuid, text);
drop function if exists public.get_account_deletion_preview();
drop function if exists public.account_deletion_plan(uuid);
drop function if exists public.club_successor(uuid, uuid);
drop function if exists public.account_is_being_deleted(uuid);

-- Kudos from deleted accounts can't keep a null giver under the old NOT NULL.
delete from public.cheers where giver_id is null;
alter table public.cheers drop constraint if exists kudos_giver_id_fkey;
alter table public.cheers add constraint kudos_giver_id_fkey
  foreign key (giver_id) references public.profiles(id) on delete cascade;
alter table public.cheers alter column giver_id set not null;
$down$);

-- ===== beta-apply-6-pr108-20261028140000_rate_limits.sql
select beta_meta.apply_pr_migration(108, '20261028140000_rate_limits.sql', $up$-- #11: server-side rate limits on abuse-prone writes and lookups.
--
-- Builds on the rate-limit core from #102 (20261028120200_rate_limit_core.sql:
-- public.rate_limits, check_rate_limit, enforce_rate_limit raising PT429 ->
-- HTTP 429). The triggers and RPCs below call enforce_rate_limit as their
-- (definer) owner. The login-with-username limits live in #102's function.
--
-- Thresholds (generous on purpose: e2e signs in and posts often):
--   login-with-username   100 / 15 min per IP, 30 / 15 min per username   (edge function)
--   find_or_create_dm      30 new conversations / hour per user           (existing DMs are free)
--   search_members        120 searches / minute per user
--   messages               60 / minute per user
--   event_comments         20 / minute per user
--   tournament_comments    20 / minute per user
--   club_posts             10 / minute per user
--   club_post_comments     20 / minute per user
--   feedback_submissions    5 / hour per user
-- Register and password reset go straight to Supabase Auth, whose own limits
-- apply (Dashboard > Authentication > Rate Limits); see CLAUDE.md.

-- BEFORE INSERT trigger: TG_ARGV = (bucket, max, window seconds), keyed per signed-in user.
-- Inserts without a user (service role, cron) are not limited.
create or replace function public.rate_limit_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is not null then
    perform public.enforce_rate_limit(tg_argv[0] || ':' || v_uid::text, tg_argv[1]::integer, tg_argv[2]::integer);
  end if;
  return new;
end;
$$;
revoke execute on function public.rate_limit_insert() from public, anon, authenticated;

drop trigger if exists trg_rate_limit_messages on public.messages;
create trigger trg_rate_limit_messages before insert on public.messages
  for each row execute function public.rate_limit_insert('message', '60', '60');

drop trigger if exists trg_rate_limit_event_comments on public.event_comments;
create trigger trg_rate_limit_event_comments before insert on public.event_comments
  for each row execute function public.rate_limit_insert('event_comment', '20', '60');

drop trigger if exists trg_rate_limit_tournament_comments on public.tournament_comments;
create trigger trg_rate_limit_tournament_comments before insert on public.tournament_comments
  for each row execute function public.rate_limit_insert('tournament_comment', '20', '60');

drop trigger if exists trg_rate_limit_club_posts on public.club_posts;
create trigger trg_rate_limit_club_posts before insert on public.club_posts
  for each row execute function public.rate_limit_insert('club_post', '10', '60');

drop trigger if exists trg_rate_limit_club_post_comments on public.club_post_comments;
create trigger trg_rate_limit_club_post_comments before insert on public.club_post_comments
  for each row execute function public.rate_limit_insert('club_post_comment', '20', '60');

drop trigger if exists trg_rate_limit_feedback on public.feedback_submissions;
create trigger trg_rate_limit_feedback before insert on public.feedback_submissions
  for each row execute function public.rate_limit_insert('feedback', '5', '3600');

-- DM creation: same behavior as before, plus a limit on NEW conversations only,
-- and a fixed search_path (it is SECURITY DEFINER).
create or replace function public.find_or_create_dm(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  conv_id uuid;
  me uuid := auth.uid();
begin
  select cm1.conversation_id into conv_id
  from public.conversation_members cm1
  join public.conversation_members cm2 on cm1.conversation_id = cm2.conversation_id
  join public.conversations c on c.id = cm1.conversation_id
  where cm1.user_id = me
    and cm2.user_id = other_user_id
    and c.type = 'dm'
  limit 1;

  if conv_id is null then
    if me is not null then
      perform public.enforce_rate_limit('dm_create:' || me::text, 30, 3600);
    end if;
    insert into public.conversations (type) values ('dm') returning id into conv_id;
    insert into public.conversation_members (conversation_id, user_id)
    values (conv_id, me), (conv_id, other_user_id);
  end if;

  return conv_id;
end;
$function$;

-- Member search for the "find a player" boxes (new DM, co-host, tournament
-- invite): substring match on username / first / last name, rate limited.
-- Signed-in users only (the boxes need an account).
create or replace function public.search_members(p_query text, p_limit integer default 10)
returns table (
  id uuid,
  username text,
  first_name text,
  last_name text,
  avatar_url text,
  selected_border text,
  "position" text[],
  skill_level text,
  created_at timestamp
)
language plpgsql
volatile -- it counts the search (PostgREST runs STABLE functions read-only)
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_term text := btrim(coalesce(p_query, ''));
  v_pattern text;
begin
  if v_uid is null or char_length(v_term) = 0 then
    return;
  end if;
  perform public.enforce_rate_limit('search:' || v_uid::text, 120, 60);
  v_pattern := '%' || replace(replace(replace(left(v_term, 64), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select p.id, p.username, p.first_name, p.last_name, p.avatar_url, p.selected_border, p."position", p.skill_level, p.created_at
    from public.profiles p
    where p.username ilike v_pattern or p.first_name ilike v_pattern or p.last_name ilike v_pattern
    order by p.username
    limit least(greatest(coalesce(p_limit, 10), 1), 50);
end;
$$;
revoke execute on function public.search_members(text, integer) from public, anon;
grant execute on function public.search_members(text, integer) to authenticated;
$up$, $down$-- Undo 20261028140000_rate_limits.sql.
drop function if exists public.search_members(text, integer);

-- find_or_create_dm exactly as it was.
create or replace function public.find_or_create_dm(other_user_id uuid)
 returns uuid
 language plpgsql
 security definer
as $function$
DECLARE
  conv_id UUID;
  me UUID := auth.uid();
BEGIN
  -- Find existing DM between the two users
  SELECT cm1.conversation_id INTO conv_id
  FROM conversation_members cm1
  JOIN conversation_members cm2 ON cm1.conversation_id = cm2.conversation_id
  JOIN conversations c ON c.id = cm1.conversation_id
  WHERE cm1.user_id = me
    AND cm2.user_id = other_user_id
    AND c.type = 'dm'
  LIMIT 1;

  IF conv_id IS NULL THEN
    INSERT INTO conversations (type) VALUES ('dm') RETURNING id INTO conv_id;
    INSERT INTO conversation_members (conversation_id, user_id)
    VALUES (conv_id, me), (conv_id, other_user_id);
  END IF;

  RETURN conv_id;
END;
$function$;
alter function public.find_or_create_dm(uuid) reset search_path;

drop trigger if exists trg_rate_limit_messages on public.messages;
drop trigger if exists trg_rate_limit_event_comments on public.event_comments;
drop trigger if exists trg_rate_limit_tournament_comments on public.tournament_comments;
drop trigger if exists trg_rate_limit_club_posts on public.club_posts;
drop trigger if exists trg_rate_limit_club_post_comments on public.club_post_comments;
drop trigger if exists trg_rate_limit_feedback on public.feedback_submissions;
drop function if exists public.rate_limit_insert();
$down$);

-- ===== beta-apply-7-pr109-20261028150000_terms_acceptance.sql
select beta_meta.apply_pr_migration(109, '20261028150000_terms_acceptance.sql', $up$-- #98: record which Terms a new account agreed to, and when.
--
-- Sign-up is passive clickwrap: the agreement line sits under every way to
-- create an account (email sign-up, Continue with Google). Email sign-up sends
-- the version it showed in the auth metadata (`terms_version`); Google sign-in
-- can't carry metadata, so the trigger falls back to the version current when
-- this migration ran. Bump that fallback together with TERMS_VERSION in
-- constants/legal.ts. Existing accounts stay null (nothing was recorded).
--
-- Expand-only: two nullable columns and a replaced trigger function that keeps
-- the old behavior (profile row with the username) and adds the two values.

alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists terms_version text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, terms_accepted_at, terms_version)
  values (
    new.id,
    lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))),
    now(),
    coalesce(nullif(left(new.raw_user_meta_data->>'terms_version', 32), ''), '2026-10-27')
  );
  return new;
end;
$$;
$up$, $down$-- Undo 20261028150000_terms_acceptance.sql: restore handle_new_user exactly, drop the columns.
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
as $function$
begin
  insert into public.profiles (id, username)
  values (new.id, lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))));
  return new;
end;
$function$;
alter function public.handle_new_user() reset search_path;
alter table public.profiles drop column if exists terms_version;
alter table public.profiles drop column if exists terms_accepted_at;
$down$);

-- ===== beta-apply-8-pr111-20261028160000_definer_search_path.sql
select beta_meta.apply_pr_migration(111, '20261028160000_definer_search_path.sql', $up$-- Hardening: every SECURITY DEFINER function gets a fixed search_path, and
-- EXECUTE is narrowed to the roles that actually call each one.
--
-- A SECURITY DEFINER function without a fixed search_path resolves unqualified
-- names through the caller's search_path, so a caller who can create objects
-- earlier on that path could make the function (running as its owner) use
-- them. `public, pg_temp` keeps the bodies working unchanged (they use
-- unqualified public names) and puts pg_temp last.
--
-- EXECUTE (the default grant is to PUBLIC, so anon too):
--   * trigger and cron functions: nobody calls them directly (EXECUTE is only
--     checked when a trigger is created, not when it fires) -> revoked from clients
--   * signed-in RPCs (chat, notifications): revoked from anon / PUBLIC, kept for authenticated
--   * is_conversation_member: only used by policies scoped to authenticated -> no anon
--   * notification_pref_enabled: only called inside definer triggers -> no clients
-- Unchanged on purpose: is_club_owner (anon evaluates it through the club_members
-- "Owners manage members" policy when browsing clubs), schema_fingerprint and
-- schema_pending_changes (the drift check calls them with the anon key),
-- get_email_by_username (handled by #102).

alter function public.auto_join_club_conversation() set search_path = public, pg_temp;
alter function public.create_club_conversation() set search_path = public, pg_temp;
alter function public.find_or_create_dm(uuid) set search_path = public, pg_temp;
alter function public.get_chat_unread_count() set search_path = public, pg_temp;
alter function public.get_my_conversations() set search_path = public, pg_temp;
alter function public.handle_new_user() set search_path = public, pg_temp;
alter function public.is_club_owner(uuid) set search_path = public, pg_temp;
alter function public.is_conversation_member(uuid) set search_path = public, pg_temp;
alter function public.mark_conversation_read(uuid) set search_path = public, pg_temp;
alter function public.notify_on_kudo_received() set search_path = public, pg_temp;
alter function public.notify_user_mentioned() set search_path = public, pg_temp;
alter function public.send_kudos_reminders() set search_path = public, pg_temp;

-- Trigger / event-trigger / cron functions: no client calls them.
revoke execute on function public.auto_join_club_conversation() from public, anon, authenticated;
revoke execute on function public.create_club_conversation() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.notify_on_kudo_received() from public, anon, authenticated;
revoke execute on function public.notify_user_mentioned() from public, anon, authenticated;
revoke execute on function public.add_club_owner_after_insert() from public, anon, authenticated;
revoke execute on function public.notify_on_event_announcement() from public, anon, authenticated;
revoke execute on function public.notify_on_event_material_change() from public, anon, authenticated;
revoke execute on function public.notify_on_waitlist_promoted() from public, anon, authenticated;
revoke execute on function public.send_kudos_reminders() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.notification_pref_enabled(uuid, text, text) from public, anon, authenticated;

-- Signed-in only.
revoke execute on function public.find_or_create_dm(uuid) from public, anon;
revoke execute on function public.get_chat_unread_count() from public, anon;
revoke execute on function public.get_my_conversations() from public, anon;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
revoke execute on function public.mark_all_notifications_read() from public, anon;
revoke execute on function public.mark_notification_read(uuid) from public, anon;
revoke execute on function public.is_conversation_member(uuid) from public, anon;
grant execute on function public.find_or_create_dm(uuid) to authenticated;
grant execute on function public.get_chat_unread_count() to authenticated;
grant execute on function public.get_my_conversations() to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.is_conversation_member(uuid) to authenticated;
$up$, $down$-- Undo 20261028160000_definer_search_path.sql: original grants, no fixed search_path.
alter function public.auto_join_club_conversation() reset search_path;
alter function public.create_club_conversation() reset search_path;
alter function public.find_or_create_dm(uuid) reset search_path;
alter function public.get_chat_unread_count() reset search_path;
alter function public.get_my_conversations() reset search_path;
alter function public.handle_new_user() reset search_path;
alter function public.is_club_owner(uuid) reset search_path;
alter function public.is_conversation_member(uuid) reset search_path;
alter function public.mark_conversation_read(uuid) reset search_path;
alter function public.notify_on_kudo_received() reset search_path;
alter function public.notify_user_mentioned() reset search_path;
alter function public.send_kudos_reminders() reset search_path;

grant execute on function public.auto_join_club_conversation() to public, anon, authenticated;
grant execute on function public.create_club_conversation() to public, anon, authenticated;
grant execute on function public.handle_new_user() to public, anon, authenticated;
grant execute on function public.notify_on_kudo_received() to public, anon, authenticated;
grant execute on function public.notify_user_mentioned() to public, anon, authenticated;
grant execute on function public.add_club_owner_after_insert() to public, anon, authenticated;
grant execute on function public.notify_on_event_announcement() to public, anon, authenticated;
grant execute on function public.notify_on_event_material_change() to public, anon, authenticated;
grant execute on function public.notify_on_waitlist_promoted() to public, anon, authenticated;
grant execute on function public.send_kudos_reminders() to public, anon, authenticated;
grant execute on function public.rls_auto_enable() to public, anon, authenticated;
grant execute on function public.notification_pref_enabled(uuid, text, text) to public, anon, authenticated;
grant execute on function public.find_or_create_dm(uuid) to public, anon;
grant execute on function public.get_chat_unread_count() to public, anon;
grant execute on function public.get_my_conversations() to public, anon;
grant execute on function public.mark_conversation_read(uuid) to public, anon;
grant execute on function public.mark_all_notifications_read() to anon;
grant execute on function public.mark_notification_read(uuid) to anon;
grant execute on function public.is_conversation_member(uuid) to public, anon;
$down$);

-- ===== beta-apply-9-pr111-20261028160100_fix_cheers_reminder_type.sql
select beta_meta.apply_pr_migration(111, '20261028160100_fix_cheers_reminder_type.sql', $up$-- Fix: send_kudos_reminders inserted notification_type 'kudos_reminder', which
-- the notifications check constraint does not allow (it allows
-- 'cheers_reminder', the type the app labels "Cheers reminders"), and its
-- duplicate check looked for 'kudos_reminder' too. The first ended event with
-- attendees would have made the kudos-reminders cron job fail.
--
-- Now it inserts and checks 'cheers_reminder', honours the person's in-app
-- "Cheers reminders" switch, and keeps the pinned search_path.
create or replace function public.send_kudos_reminders()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
DECLARE
  ev RECORD;
  attendee_id uuid;
BEGIN
  FOR ev IN
    SELECT e.id, e.title
    FROM events e
    WHERE e.cancelled_at IS NULL
      AND (e.event_date + (COALESCE(e.duration_minutes, 120) * INTERVAL '1 minute'))
          BETWEEN NOW() - INTERVAL '15 minutes' AND NOW()
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.notification_type = 'cheers_reminder'
          AND (n.data->>'event_id') = e.id::text
        LIMIT 1
      )
  LOOP
    FOR attendee_id IN
      SELECT ea.user_id
      FROM event_attendees ea
      WHERE ea.event_id = ev.id
        AND ea.status = 'attending'
        AND notification_pref_enabled(ea.user_id, 'in_app', 'cheers_reminder')
    LOOP
      INSERT INTO notifications (user_id, notification_type, title, body, data)
      VALUES (
        attendee_id,
        'cheers_reminder',
        'Time to give cheers! 🏐',
        'The event "' || ev.title || '" just ended. Give cheers to your fellow players!',
        jsonb_build_object(
          'event_id', ev.id::text,
          'deep_link', '/event/' || ev.id::text || '?tab=3'
        )
      );
    END LOOP;
  END LOOP;
END;
$function$;
revoke execute on function public.send_kudos_reminders() from public, anon, authenticated;
$up$, $down$-- Undo 20261028160100_fix_cheers_reminder_type.sql: the original body (with
-- the 'kudos_reminder' type), keeping the search_path set by 20261028160000.
create or replace function public.send_kudos_reminders()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
DECLARE
  ev RECORD;
  attendee_id uuid;
BEGIN
  FOR ev IN
    SELECT e.id, e.title
    FROM events e
    WHERE e.cancelled_at IS NULL
      AND (e.event_date + (COALESCE(e.duration_minutes, 120) * INTERVAL '1 minute'))
          BETWEEN NOW() - INTERVAL '15 minutes' AND NOW()
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.notification_type = 'kudos_reminder'
          AND (n.data->>'event_id') = e.id::text
        LIMIT 1
      )
  LOOP
    FOR attendee_id IN
      SELECT ea.user_id
      FROM event_attendees ea
      WHERE ea.event_id = ev.id
        AND ea.status = 'attending'
    LOOP
      INSERT INTO notifications (user_id, notification_type, title, body, data)
      VALUES (
        attendee_id,
        'kudos_reminder',
        'Time to give cheers! 🏐',
        'The event "' || ev.title || '" just ended. Give cheers to your fellow players!',
        jsonb_build_object(
          'event_id', ev.id::text,
          'deep_link', '/event/' || ev.id::text || '?tab=3'
        )
      );
    END LOOP;
  END LOOP;
END;
$function$;
$down$);

