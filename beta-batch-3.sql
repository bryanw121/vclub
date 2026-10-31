-- vteam: BETA (CI) database only, project uifolvbwtrbcmfrvelnl. Do NOT run on live.
-- Run after beta-batch-1.sql and beta-batch-2.sql. #120 badge art, #123 friends, #122 tournament registration rules, #125 trophies.

-- ===== beta-apply-c3-pr120-20261028203031_badge_art.sql
select beta_meta.apply_pr_migration(120, '20261028203031_badge_art.sql', $up$
-- #10: generated badge art. One row per (badge, tier) with the public URL of
-- the PNG the admin-only generate-badge-art edge function stored in the
-- `badges` bucket. The app reads it (hooks/useBadgeArt) and falls back to the
-- built-in art when there is no row; nothing generates on the render path.
--
-- Expand only: a new table. Readable by everyone (badges show on public
-- profiles, guests included); written only by the edge function with the
-- service role, so clients get no write grant and no write policy.

create table if not exists public.badge_art (
  badge_type text not null check (badge_type ~ '^[a-z0-9_]{1,40}$'),
  tier smallint not null check (tier between 1 and 10),
  image_url text not null check (image_url ~ '^https://' and char_length(image_url) <= 500),
  prompt text not null check (char_length(prompt) <= 4000),
  model text not null check (char_length(model) <= 80),
  generated_by uuid references auth.users(id) on delete set null,
  generated_at timestamptz not null default now(),
  primary key (badge_type, tier)
);

create index if not exists badge_art_generated_by_idx on public.badge_art (generated_by);

alter table public.badge_art enable row level security;

revoke all on public.badge_art from anon, authenticated;
grant select (badge_type, tier, image_url, generated_at) on public.badge_art to anon, authenticated;

drop policy if exists badge_art_select on public.badge_art;
create policy badge_art_select on public.badge_art
  for select to anon, authenticated
  using (true);
$up$, $down$
-- Undo 20261028203031_badge_art: drop the table (policy and index go with it).
-- Stored PNGs in the badges bucket are left in place.
drop table if exists public.badge_art;
$down$);

-- ===== beta-apply-c3-pr123-20261028203837_friends.sql
select beta_meta.apply_pr_migration(123, '20261028203837_friends.sql', $up$
-- #15 Friends: mutual friendships (request, then accept or decline), a private
-- best-friend flag (at most 10), and the "friends going" lookup for events.
--
-- Expand only: two new tables, six functions, and two more values allowed by
-- the notifications type check.
--
-- Privacy
--   * friend_requests: only the two people on a PENDING request see it, so a
--     declined request is never shown to the person who sent it.
--   * friendships: one row per direction. Each person sees only their own
--     rows, so both see the friendship but only the owner sees their own
--     is_best_friend flag. Nobody else can list anyone's friends.
--   * Guests (anon) get no grant on either table and no EXECUTE on the RPCs.
--   * Clients never write either table: every change goes through the
--     SECURITY DEFINER RPCs below (fixed search_path, auth.uid() as the actor).
--
-- Limits (send_friend_request)
--   * 30 requests a day per sender.
--   * The same person at most 3 times a week, and not again within 7 days of
--     them declining.
--   * Nobody who has silenced you (chat_silences) gets requests from you.

-- ─── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

create unique index if not exists friend_requests_one_pending_idx
  on public.friend_requests (requester_id, addressee_id) where status = 'pending';
create index if not exists friend_requests_addressee_pending_idx
  on public.friend_requests (addressee_id) where status = 'pending';
create index if not exists friend_requests_requester_created_idx
  on public.friend_requests (requester_id, created_at);

create table if not exists public.friendships (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  is_best_friend boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create index if not exists friendships_friend_id_idx on public.friendships (friend_id);

alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;

revoke all on public.friend_requests from anon, authenticated;
revoke all on public.friendships from anon, authenticated;
grant select on public.friend_requests to authenticated;
grant select on public.friendships to authenticated;

drop policy if exists friend_requests_select_pending_own on public.friend_requests;
create policy friend_requests_select_pending_own on public.friend_requests
  for select to authenticated
  using (status = 'pending' and (select auth.uid()) in (requester_id, addressee_id));

drop policy if exists friendships_select_own on public.friendships;
create policy friendships_select_own on public.friendships
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ─── Notifications: two more types ───────────────────────────────────────────

alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
  check (notification_type = any (array[
    'event_announcement', 'cheers_received', 'event_material_change', 'waitlist_promoted',
    'event_cancelled', 'badge_earned', 'cohost_added', 'cheers_reminder', 'user_mentioned',
    'join_request', 'request_approved', 'request_denied', 'tournament_team_invite',
    'tournament_join_request', 'tournament_join_accepted', 'tournament_join_declined',
    'tournament_free_agent_assigned', 'tournament_mention', 'chat_mention',
    'friend_request', 'friend_accepted'
  ]::text[]));

-- ─── Helpers (not callable by clients) ───────────────────────────────────────

-- Serialises every change to one pair, so two people requesting each other at
-- the same moment can't both insert, and accept can't race cancel.
create or replace function public.friend_pair_lock(p_a uuid, p_b uuid)
returns void
language sql
volatile
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('friend:' || least(p_a, p_b)::text || ':' || greatest(p_a, p_b)::text, 0));
$$;

-- Accepts a pending request (caller holds the pair lock): both friendship
-- rows, the request closed, the requester notified, the addressee's request
-- notification marked read.
create or replace function public.friend_accept(p_request_id uuid, p_requester uuid, p_addressee uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  update public.friend_requests
     set status = 'accepted', responded_at = now()
   where id = p_request_id and status = 'pending';

  insert into public.friendships (user_id, friend_id)
  values (p_requester, p_addressee), (p_addressee, p_requester)
  on conflict do nothing;

  update public.notifications
     set read_at = now()
   where user_id = p_addressee and notification_type = 'friend_request'
     and data->>'request_id' = p_request_id::text and read_at is null;

  if public.notification_pref_enabled(p_requester, 'in_app', 'friend_accepted') then
    select coalesce(nullif(btrim(p.first_name), ''), p.username, 'Someone') into v_name
      from public.profiles p where p.id = p_addressee;
    insert into public.notifications (user_id, notification_type, title, body, data)
    values (
      p_requester, 'friend_accepted', 'Friend request accepted',
      left(coalesce(v_name, 'Someone'), 60) || ' accepted your friend request',
      jsonb_build_object('user_id', p_addressee, 'deep_link', '/profile/' || p_addressee::text)
    );
  end if;
end;
$$;

revoke execute on function public.friend_pair_lock(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.friend_accept(uuid, uuid, uuid) from public, anon, authenticated;

-- ─── RPCs ────────────────────────────────────────────────────────────────────
-- Each returns the caller's relationship to the other person afterwards:
-- 'none' | 'requested' (I asked them) | 'friends'.

create or replace function public.send_friend_request(p_user_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_reverse uuid;
  v_request uuid;
  v_name text;
begin
  if v_me is null then
    raise exception 'sign in required' using errcode = '28000';
  end if;
  if p_user_id is null or p_user_id = v_me or not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'invalid user' using errcode = '22023';
  end if;

  perform public.friend_pair_lock(v_me, p_user_id);

  if exists (select 1 from public.friendships f where f.user_id = v_me and f.friend_id = p_user_id) then
    return 'friends';
  end if;
  if exists (select 1 from public.friend_requests r
              where r.requester_id = v_me and r.addressee_id = p_user_id and r.status = 'pending') then
    return 'requested';
  end if;

  -- They already asked me: asking back accepts.
  select r.id into v_reverse from public.friend_requests r
   where r.requester_id = p_user_id and r.addressee_id = v_me and r.status = 'pending';
  if v_reverse is not null then
    perform public.friend_accept(v_reverse, p_user_id, v_me);
    return 'friends';
  end if;

  if exists (select 1 from public.chat_silences s where s.user_id = p_user_id and s.silenced_user_id = v_me) then
    raise exception 'friend request not allowed' using errcode = '42501';
  end if;

  if (select count(*) from public.friend_requests r
       where r.requester_id = v_me and r.created_at > now() - interval '1 day') >= 30 then
    raise exception 'friend request limit reached' using errcode = 'PT429';
  end if;
  if (select count(*) from public.friend_requests r
       where r.requester_id = v_me and r.addressee_id = p_user_id and r.created_at > now() - interval '7 days') >= 3
     or exists (select 1 from public.friend_requests r
                 where r.requester_id = v_me and r.addressee_id = p_user_id
                   and r.status = 'declined' and r.responded_at > now() - interval '7 days') then
    raise exception 'friend request limit reached' using errcode = 'PT429';
  end if;

  insert into public.friend_requests (requester_id, addressee_id)
  values (v_me, p_user_id)
  returning id into v_request;

  if public.notification_pref_enabled(p_user_id, 'in_app', 'friend_request') then
    select coalesce(nullif(btrim(p.first_name), ''), p.username, 'Someone') into v_name
      from public.profiles p where p.id = v_me;
    insert into public.notifications (user_id, notification_type, title, body, data)
    values (
      p_user_id, 'friend_request', 'New friend request',
      left(coalesce(v_name, 'Someone'), 60) || ' sent you a friend request',
      jsonb_build_object('request_id', v_request, 'user_id', v_me, 'deep_link', '/settings/friends')
    );
  end if;
  return 'requested';
end;
$$;

create or replace function public.respond_friend_request(p_request_id uuid, p_accept boolean)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_requester uuid;
begin
  if v_me is null then
    raise exception 'sign in required' using errcode = '28000';
  end if;
  select r.requester_id into v_requester from public.friend_requests r
   where r.id = p_request_id and r.addressee_id = v_me and r.status = 'pending';
  if v_requester is null then
    raise exception 'friend request not found' using errcode = 'P0002';
  end if;

  perform public.friend_pair_lock(v_me, v_requester);
  -- Re-check under the lock: it may have been cancelled meanwhile.
  if not exists (select 1 from public.friend_requests r where r.id = p_request_id and r.status = 'pending') then
    raise exception 'friend request not found' using errcode = 'P0002';
  end if;

  if coalesce(p_accept, false) then
    perform public.friend_accept(p_request_id, v_requester, v_me);
    return 'friends';
  end if;

  update public.friend_requests set status = 'declined', responded_at = now() where id = p_request_id;
  update public.notifications
     set read_at = now()
   where user_id = v_me and notification_type = 'friend_request'
     and data->>'request_id' = p_request_id::text and read_at is null;
  return 'none';
end;
$$;

create or replace function public.cancel_friend_request(p_user_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_request uuid;
begin
  if v_me is null then
    raise exception 'sign in required' using errcode = '28000';
  end if;
  if p_user_id is null then
    raise exception 'invalid user' using errcode = '22023';
  end if;
  perform public.friend_pair_lock(v_me, p_user_id);

  update public.friend_requests
     set status = 'cancelled', responded_at = now()
   where requester_id = v_me and addressee_id = p_user_id and status = 'pending'
  returning id into v_request;

  -- Take back the unread notification so they don't open a request that is gone.
  if v_request is not null then
    delete from public.notifications
     where user_id = p_user_id and notification_type = 'friend_request'
       and data->>'request_id' = v_request::text and read_at is null;
  end if;

  if exists (select 1 from public.friendships f where f.user_id = v_me and f.friend_id = p_user_id) then
    return 'friends';
  end if;
  return 'none';
end;
$$;

create or replace function public.remove_friend(p_user_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'sign in required' using errcode = '28000';
  end if;
  if p_user_id is null then
    raise exception 'invalid user' using errcode = '22023';
  end if;
  perform public.friend_pair_lock(v_me, p_user_id);
  delete from public.friendships
   where (user_id = v_me and friend_id = p_user_id)
      or (user_id = p_user_id and friend_id = v_me);
  return 'none';
end;
$$;

create or replace function public.set_best_friend(p_user_id uuid, p_best boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'sign in required' using errcode = '28000';
  end if;
  -- One best-friend change at a time per person, so the cap holds.
  perform pg_advisory_xact_lock(hashtextextended('best-friend:' || v_me::text, 0));

  if not exists (select 1 from public.friendships f where f.user_id = v_me and f.friend_id = p_user_id) then
    raise exception 'not friends' using errcode = 'P0002';
  end if;
  if coalesce(p_best, false)
     and not exists (select 1 from public.friendships f
                      where f.user_id = v_me and f.friend_id = p_user_id and f.is_best_friend)
     and (select count(*) from public.friendships f where f.user_id = v_me and f.is_best_friend) >= 10 then
    raise exception 'best friend limit reached' using errcode = '23514';
  end if;

  update public.friendships
     set is_best_friend = coalesce(p_best, false)
   where user_id = v_me and friend_id = p_user_id;
  return coalesce(p_best, false);
end;
$$;

-- Friends of the caller who are attending the given events, best friends
-- first. SECURITY INVOKER: friendships RLS limits it to the caller's own rows;
-- attendance and profiles are already public.
create or replace function public.get_friends_going(p_event_ids uuid[])
returns table (event_id uuid, user_id uuid, username text, first_name text, avatar_url text, is_best_friend boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select ea.event_id, f.friend_id, p.username, p.first_name, p.avatar_url, f.is_best_friend
  from public.friendships f
  join public.event_attendees ea
    on ea.user_id = f.friend_id and ea.status = 'attending' and ea.event_id = any (p_event_ids)
  join public.profiles p on p.id = f.friend_id
  where f.user_id = (select auth.uid())
    and cardinality(p_event_ids) <= 500
  order by ea.event_id, f.is_best_friend desc, ea.joined_at;
$$;

revoke execute on function public.send_friend_request(uuid) from public, anon;
revoke execute on function public.respond_friend_request(uuid, boolean) from public, anon;
revoke execute on function public.cancel_friend_request(uuid) from public, anon;
revoke execute on function public.remove_friend(uuid) from public, anon;
revoke execute on function public.set_best_friend(uuid, boolean) from public, anon;
revoke execute on function public.get_friends_going(uuid[]) from public, anon;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.set_best_friend(uuid, boolean) to authenticated;
grant execute on function public.get_friends_going(uuid[]) to authenticated;
$up$, $down$
-- Undo 20261028203837_friends.

drop function if exists public.get_friends_going(uuid[]);
drop function if exists public.set_best_friend(uuid, boolean);
drop function if exists public.remove_friend(uuid);
drop function if exists public.cancel_friend_request(uuid);
drop function if exists public.respond_friend_request(uuid, boolean);
drop function if exists public.send_friend_request(uuid);
drop function if exists public.friend_accept(uuid, uuid, uuid);
drop function if exists public.friend_pair_lock(uuid, uuid);

-- The old check would reject these rows.
delete from public.notifications where notification_type in ('friend_request', 'friend_accepted');
alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
  check (notification_type = any (array[
    'event_announcement', 'cheers_received', 'event_material_change', 'waitlist_promoted',
    'event_cancelled', 'badge_earned', 'cohost_added', 'cheers_reminder', 'user_mentioned',
    'join_request', 'request_approved', 'request_denied', 'tournament_team_invite',
    'tournament_join_request', 'tournament_join_accepted', 'tournament_join_declined',
    'tournament_free_agent_assigned', 'tournament_mention', 'chat_mention'
  ]::text[]));

drop table if exists public.friendships;
drop table if exists public.friend_requests;
$down$);

-- ===== beta-apply-b3-pr122-20261028204038_tournament_registration_rules.sql
select beta_meta.apply_pr_migration(122, '20261028204038_tournament_registration_rules.sql', $up$-- Tournament registration rules, enforced in the database (#7).
--
-- Until now every rule was client-side: the insert policy on tournament_teams is
-- just "signed in", so anyone with a tournament id could register after the
-- deadline, past max_teams, outside the skill levels, or onto a full roster, and
-- a captain could approve their own team or mark it paid ("captain can update
-- own team" covers every column). These triggers add the rules RLS can't express.
--
-- The organizer (tournaments.created_by) is exempt everywhere: they manage teams
-- freely (late adds, moving players, approvals). So are writes made by another
-- trigger (waitlist promotion below) and by the service role (no auth.uid()).
--
-- tournament_teams, BEFORE INSERT (registering a team or a free-agent entry):
--   - the tournament is published and the deadline (if any) hasn't passed
--   - the registrant is a member of the tournament's club and captains the team
--   - their skill level is one of tournaments.skill_levels (when any are set)
--   - past max_teams a team is waitlisted instead of registered (an advisory
--     lock per tournament serializes concurrent registrations)
--   - approval, payment, seed and lock flags start cleared
-- tournament_teams, BEFORE UPDATE: only the organizer may change status,
--   approval, payment, seed, lock or the tournament; captains may still rename
--   their team or hand over the captaincy.
-- tournament_team_members, BEFORE INSERT (joining a team: invite accepted,
--   join request approved, self-registration):
--   - the tournament is published and the deadline hasn't passed
--   - the player is a club member and their skill level is allowed
--   - the team's roster is below max_roster_size (free-agent entries excepted)
-- tournament_teams, AFTER DELETE / AFTER UPDATE OF status: when a registered
--   team leaves, the earliest waitlisted team takes its place (published
--   tournaments with max_teams only).
--
-- Expand-only: new functions and triggers, no table changes. Existing rows are
-- untouched. Trigger functions are SECURITY DEFINER (they read tournaments,
-- profiles and rosters regardless of the caller's RLS) with an empty
-- search_path; triggers can't be called directly, and EXECUTE is revoked anyway.

create or replace function public.tournament_registration_check(
  p_tournament public.tournaments,
  p_player uuid
) returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_skill text;
begin
  if p_tournament.status is distinct from 'published' then
    raise exception 'Registration is closed for this tournament' using errcode = 'P0001';
  end if;
  if p_tournament.registration_deadline is not null and now() > p_tournament.registration_deadline then
    raise exception 'The registration deadline has passed' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.club_members cm
    where cm.club_id = p_tournament.club_id and cm.user_id = p_player
  ) then
    raise exception 'Only members of the hosting club can play in this tournament' using errcode = '42501';
  end if;
  if coalesce(array_length(p_tournament.skill_levels, 1), 0) > 0 then
    select p.skill_level into v_skill from public.profiles p where p.id = p_player;
    if v_skill is null or not (v_skill = any (p_tournament.skill_levels)) then
      raise exception 'This tournament is limited to certain skill levels, and % not eligible',
        case when p_player = auth.uid() then 'you are' else 'that player is' end
        using errcode = 'P0001',
              hint = 'Set your skill level on your profile if it is missing.';
    end if;
  end if;
end;
$$;

revoke all on function public.tournament_registration_check(public.tournaments, uuid) from public, anon, authenticated;

-- ─── Registering a team ───────────────────────────────────────────────────────

create or replace function public.tournament_team_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_t public.tournaments%rowtype;
  v_registered integer;
begin
  select * into v_t from public.tournaments where id = new.tournament_id;
  if not found then
    raise exception 'Tournament not found' using errcode = 'P0002';
  end if;
  if v_uid is null or v_uid = v_t.created_by or pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.captain_user_id is distinct from v_uid then
    raise exception 'You can only register a team you captain' using errcode = '42501';
  end if;
  if new.status not in ('registered', 'free_agent', 'waitlisted') then
    raise exception 'Invalid registration status' using errcode = '22023';
  end if;
  perform public.tournament_registration_check(v_t, v_uid);

  new.is_approved := false;
  new.is_paid := false;
  new.is_locked := false;
  new.seed := null;

  if new.status = 'registered' and v_t.max_teams is not null then
    perform pg_advisory_xact_lock(hashtextextended('tournament_teams:' || new.tournament_id::text, 0));
    select count(*) into v_registered
    from public.tournament_teams
    where tournament_id = new.tournament_id and status = 'registered';
    if v_registered >= v_t.max_teams then
      new.status := 'waitlisted';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.tournament_team_before_insert() from public, anon, authenticated;

drop trigger if exists tournament_team_before_insert on public.tournament_teams;
create trigger tournament_team_before_insert
  before insert on public.tournament_teams
  for each row execute function public.tournament_team_before_insert();

-- ─── Captains can't approve themselves ───────────────────────────────────────

create or replace function public.tournament_team_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or pg_trigger_depth() > 1 then
    return new;
  end if;
  if exists (select 1 from public.tournaments t where t.id = old.tournament_id and t.created_by = v_uid) then
    return new;
  end if;
  if new.status is distinct from old.status
     or new.is_approved is distinct from old.is_approved
     or new.is_paid is distinct from old.is_paid
     or new.seed is distinct from old.seed
     or new.is_locked is distinct from old.is_locked
     or new.tournament_id is distinct from old.tournament_id then
    raise exception 'Only the organizer can change that' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.tournament_team_before_update() from public, anon, authenticated;

drop trigger if exists tournament_team_before_update on public.tournament_teams;
create trigger tournament_team_before_update
  before update on public.tournament_teams
  for each row execute function public.tournament_team_before_update();

-- ─── Joining a team ───────────────────────────────────────────────────────────

create or replace function public.tournament_member_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_team public.tournament_teams%rowtype;
  v_t public.tournaments%rowtype;
  v_count integer;
begin
  -- Lock the team row so two joins can't both take the last roster spot.
  select * into v_team from public.tournament_teams where id = new.team_id for update;
  if not found then
    raise exception 'That team no longer exists' using errcode = 'P0002';
  end if;
  select * into v_t from public.tournaments where id = v_team.tournament_id;
  if v_uid is null or v_uid = v_t.created_by or pg_trigger_depth() > 1 then
    return new;
  end if;

  perform public.tournament_registration_check(v_t, new.user_id);

  if v_team.status <> 'free_agent' then
    select count(*) into v_count from public.tournament_team_members where team_id = new.team_id;
    if v_count >= v_t.max_roster_size then
      raise exception 'This team''s roster is full (% players)', v_t.max_roster_size using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.tournament_member_before_insert() from public, anon, authenticated;

drop trigger if exists tournament_member_before_insert on public.tournament_team_members;
create trigger tournament_member_before_insert
  before insert on public.tournament_team_members
  for each row execute function public.tournament_member_before_insert();

-- ─── Waitlist promotion ───────────────────────────────────────────────────────

create or replace function public.tournament_promote_waitlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.tournaments%rowtype;
  v_registered integer;
  v_next uuid;
begin
  if old.status <> 'registered' then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.status = 'registered' then
    return null;
  end if;
  select * into v_t from public.tournaments where id = old.tournament_id;
  -- Gone (cascading delete), not taking teams, or no cap: nothing to do.
  if not found or v_t.status <> 'published' or v_t.max_teams is null then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('tournament_teams:' || old.tournament_id::text, 0));
  select count(*) into v_registered
  from public.tournament_teams where tournament_id = old.tournament_id and status = 'registered';
  if v_registered >= v_t.max_teams then
    return null;
  end if;
  select id into v_next
  from public.tournament_teams
  where tournament_id = old.tournament_id and status = 'waitlisted'
  order by created_at, id
  limit 1;
  if v_next is not null then
    update public.tournament_teams set status = 'registered' where id = v_next;
  end if;
  return null;
end;
$$;

revoke all on function public.tournament_promote_waitlist() from public, anon, authenticated;

drop trigger if exists tournament_promote_waitlist_on_delete on public.tournament_teams;
create trigger tournament_promote_waitlist_on_delete
  after delete on public.tournament_teams
  for each row execute function public.tournament_promote_waitlist();

drop trigger if exists tournament_promote_waitlist_on_update on public.tournament_teams;
create trigger tournament_promote_waitlist_on_update
  after update of status on public.tournament_teams
  for each row execute function public.tournament_promote_waitlist();
$up$, $down$-- Undo 20261028204038_tournament_registration_rules.sql exactly.
drop trigger if exists tournament_promote_waitlist_on_update on public.tournament_teams;
drop trigger if exists tournament_promote_waitlist_on_delete on public.tournament_teams;
drop trigger if exists tournament_member_before_insert on public.tournament_team_members;
drop trigger if exists tournament_team_before_update on public.tournament_teams;
drop trigger if exists tournament_team_before_insert on public.tournament_teams;
drop function if exists public.tournament_promote_waitlist();
drop function if exists public.tournament_member_before_insert();
drop function if exists public.tournament_team_before_update();
drop function if exists public.tournament_team_before_insert();
drop function if exists public.tournament_registration_check(public.tournaments, uuid);
$down$);

-- ===== beta-apply-b3-pr125-20261028205312_tournament_trophies.sql
select beta_meta.apply_pr_migration(125, '20261028205312_tournament_trophies.sql', $up$-- Tournament trophies on profiles, and host rule settings (#7).
--
-- tournament_rules gains two host settings:
--   tiebreakers        order of standings tiebreakers after wins (any of
--                      head_to_head, set_ratio, point_diff, points_for)
--   third_place_match  single elimination: play off third place instead of
--                      both semifinal losers sharing it
-- Both have defaults, so existing rows and older app versions are unaffected.
--
-- tournament_trophies: one row per player per podium place, written only by
-- complete_tournament(). Public read (anon + authenticated) because profiles
-- are public: a trophy shows on the winner's profile for anyone. The row keeps
-- the tournament title, date and team name, since tournaments themselves are
-- readable by club members only. No client writes (no INSERT/UPDATE/DELETE
-- grant or policy).
--
-- complete_tournament(p_tournament_id, p_podium): the organizer finishes a
-- tournament in one transaction: status -> completed (points PR #100 awards on
-- that) and the podium's rosters get trophies. Calling it again (a corrected
-- final) replaces that tournament's trophies. p_podium is a JSON array of
-- { team_id, place } with exactly one 1st, at most one 2nd and at most two 3rd
-- (ties for third), all registered teams of this tournament, no team twice.
-- A player on two podium teams (should not happen) keeps the better place.
--
-- Expand-only: new columns with defaults, a new table, a new function.

alter table public.tournament_rules
  add column if not exists tiebreakers text[] not null
    default array['head_to_head', 'set_ratio', 'point_diff', 'points_for']::text[],
  add column if not exists third_place_match boolean not null default false;

alter table public.tournament_rules drop constraint if exists tournament_rules_tiebreakers_check;
alter table public.tournament_rules add constraint tournament_rules_tiebreakers_check
  check (
    cardinality(tiebreakers) between 1 and 4
    and tiebreakers <@ array['head_to_head', 'set_ratio', 'point_diff', 'points_for']::text[]
  );

create table if not exists public.tournament_trophies (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  team_id uuid references public.tournament_teams (id) on delete set null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  place smallint not null check (place between 1 and 3),
  tournament_title text not null,
  tournament_date timestamptz not null,
  team_name text not null,
  awarded_at timestamptz not null default now(),
  constraint tournament_trophies_once_per_player unique (tournament_id, user_id)
);

create index if not exists tournament_trophies_user_id_idx on public.tournament_trophies (user_id, tournament_date desc);
create index if not exists tournament_trophies_team_id_idx on public.tournament_trophies (team_id);

alter table public.tournament_trophies enable row level security;

-- Supabase grants everything on new public tables by default: read-only for clients.
revoke all on table public.tournament_trophies from anon, authenticated;
grant select on table public.tournament_trophies to anon, authenticated;

drop policy if exists "Trophies are public" on public.tournament_trophies;
create policy "Trophies are public"
  on public.tournament_trophies for select
  to anon, authenticated
  using (true);

create or replace function public.complete_tournament(p_tournament_id uuid, p_podium jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_t public.tournaments%rowtype;
  v_firsts integer;
  v_seconds integer;
  v_thirds integer;
  v_entries integer;
  v_valid integer;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Sign in to finish the tournament' using errcode = '28000';
  end if;
  select * into v_t from public.tournaments where id = p_tournament_id for update;
  if not found or v_t.created_by <> v_uid then
    raise exception 'Only the organizer can finish the tournament' using errcode = '42501';
  end if;
  if v_t.status = 'cancelled' then
    raise exception 'This tournament was cancelled' using errcode = 'P0001';
  end if;
  if p_podium is null or jsonb_typeof(p_podium) <> 'array' then
    raise exception 'p_podium must be a JSON array' using errcode = '22023';
  end if;

  select count(*),
         count(*) filter (where e->>'place' = '1'),
         count(*) filter (where e->>'place' = '2'),
         count(*) filter (where e->>'place' = '3')
    into v_entries, v_firsts, v_seconds, v_thirds
  from jsonb_array_elements(p_podium) e;
  if v_firsts <> 1 or v_seconds > 1 or v_thirds > 2 or v_entries <> v_firsts + v_seconds + v_thirds then
    raise exception 'A podium has one champion, at most one runner-up and at most two third places' using errcode = '22023';
  end if;

  -- Every entry is a distinct registered team of this tournament.
  select count(distinct tt.id) into v_valid
  from jsonb_array_elements(p_podium) e
  join public.tournament_teams tt
    on tt.id::text = e->>'team_id' and tt.tournament_id = p_tournament_id and tt.status = 'registered';
  if v_valid <> v_entries then
    raise exception 'Podium teams must be different registered teams of this tournament' using errcode = '22023';
  end if;

  update public.tournaments set status = 'completed' where id = p_tournament_id;

  delete from public.tournament_trophies where tournament_id = p_tournament_id;
  insert into public.tournament_trophies (tournament_id, team_id, user_id, place, tournament_title, tournament_date, team_name)
  select distinct on (m.user_id)
         p_tournament_id, tt.id, m.user_id, (e->>'place')::smallint, v_t.title, v_t.start_date, tt.name
  from jsonb_array_elements(p_podium) e
  join public.tournament_teams tt on tt.id::text = e->>'team_id'
  join public.tournament_team_members m on m.team_id = tt.id
  order by m.user_id, (e->>'place')::smallint;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.complete_tournament(uuid, jsonb) from public, anon;
grant execute on function public.complete_tournament(uuid, jsonb) to authenticated;
$up$, $down$-- Undo the trophies + rule settings migration exactly.
drop function if exists public.complete_tournament(uuid, jsonb);
drop table if exists public.tournament_trophies;
alter table public.tournament_rules drop constraint if exists tournament_rules_tiebreakers_check;
alter table public.tournament_rules drop column if exists third_place_match;
alter table public.tournament_rules drop column if exists tiebreakers;
$down$);

