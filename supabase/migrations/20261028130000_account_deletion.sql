-- #99 part 2: in-app account deletion.
--
-- Flow: the app shows get_account_deletion_preview() (what will be deleted and
-- what will be handed to whom), then calls the delete-account edge function,
-- which runs prepare_account_deletion(user) with the service role and then
-- auth.admin.deleteUser(user). Both preview and execution come from the same
-- account_deletion_plan(), so the person deletes exactly what they were shown.
--
-- What happens to what the person owned or did:
--   clubs they created         -> another owner of the club, else the club is deleted
--                                 (with its tournaments, posts and chat)
--   tournaments they created   -> an owner of the tournament's club, else deleted
--   upcoming events they host  -> their earliest co-host, else cancelled (attendees
--                                 get the usual "event cancelled" notification)
--   past events they hosted    -> kept, host removed (events.created_by = null)
--   tournament captaincies     -> next team member, else the team has no captain
--   co-hosts they added        -> recorded as added by the co-host themself
--   tournament comments, team memberships, invitations, join requests -> deleted
--   everything else (messages, comments, RSVPs, kudos, settings, tokens...) is
--   removed by the existing ON DELETE CASCADE / SET NULL foreign keys.
--
-- Nothing here changes an existing object's shape (expand-only).

create or replace function public.account_deletion_plan(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_clubs jsonb;
  v_tournaments jsonb;
  v_events jsonb;
  v_past int;
begin
  -- Clubs the person created: another owner takes over, else the club goes.
  with c as (
    select cl.id, cl.name,
      (select m.user_id from public.club_members m
        where m.club_id = cl.id and m.role = 'owner' and m.user_id <> p_user
        order by m.joined_at, m.user_id limit 1) as successor
    from public.clubs cl
    where cl.created_by = p_user
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name,
      'action', case when c.successor is null then 'delete' else 'transfer' end,
      'to', case when c.successor is null then null else jsonb_build_object(
        'id', p.id, 'username', p.username, 'first_name', p.first_name, 'last_name', p.last_name) end
    ) order by c.name), '[]'::jsonb)
  into v_clubs
  from c left join public.profiles p on p.id = c.successor;

  -- Tournaments: those the person created, plus any tournament inside a club
  -- that is about to be deleted (they go with the club, whoever created them).
  with deleted_clubs as (
    select (x->>'id')::uuid as id, x->>'name' as name
    from jsonb_array_elements(v_clubs) x where x->>'action' = 'delete'
  ),
  transferred_clubs as (
    select (x->>'id')::uuid as id, (x->'to'->>'id')::uuid as successor
    from jsonb_array_elements(v_clubs) x where x->>'action' = 'transfer'
  ),
  t as (
    select tr.id, tr.title, dc.name as club_name,
      case
        when dc.id is not null then null
        when tc.successor is not null then tc.successor
        when cl.created_by <> p_user then cl.created_by
        else (select m.user_id from public.club_members m
               where m.club_id = tr.club_id and m.role = 'owner' and m.user_id <> p_user
               order by m.joined_at, m.user_id limit 1)
      end as successor
    from public.tournaments tr
    join public.clubs cl on cl.id = tr.club_id
    left join deleted_clubs dc on dc.id = tr.club_id
    left join transferred_clubs tc on tc.id = tr.club_id
    where tr.created_by = p_user or dc.id is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'title', t.title,
      'action', case when t.successor is null then 'delete' else 'transfer' end,
      'with_club', t.club_name,
      'to', case when t.successor is null then null else jsonb_build_object(
        'id', p.id, 'username', p.username, 'first_name', p.first_name, 'last_name', p.last_name) end
    ) order by t.title), '[]'::jsonb)
  into v_tournaments
  from t left join public.profiles p on p.id = t.successor;

  -- Upcoming events they host: earliest co-host takes over, else cancelled.
  with e as (
    select ev.id, ev.title, ev.event_date,
      (select c.user_id from public.event_cohosts c
        where c.event_id = ev.id and c.user_id <> p_user
        order by c.added_at, c.user_id limit 1) as successor
    from public.events ev
    where ev.created_by = p_user and ev.cancelled_at is null and ev.event_date > (now() at time zone 'utc')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'title', e.title, 'event_date', e.event_date,
      'action', case when e.successor is null then 'cancel' else 'transfer' end,
      'to', case when e.successor is null then null else jsonb_build_object(
        'id', p.id, 'username', p.username, 'first_name', p.first_name, 'last_name', p.last_name) end
    ) order by e.event_date), '[]'::jsonb)
  into v_events
  from e left join public.profiles p on p.id = e.successor;

  select count(*) into v_past
  from public.events ev
  where ev.created_by = p_user and (ev.cancelled_at is not null or ev.event_date <= (now() at time zone 'utc'));

  return jsonb_build_object('clubs', v_clubs, 'tournaments', v_tournaments, 'events', v_events, 'past_events_kept', v_past);
end;
$$;
revoke execute on function public.account_deletion_plan(uuid) from public, anon, authenticated;
grant execute on function public.account_deletion_plan(uuid) to service_role;

-- What deleting the signed-in account would do (the confirm screen).
create or replace function public.get_account_deletion_preview()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when (select auth.uid()) is null then null
              else public.account_deletion_plan((select auth.uid())) end
$$;
revoke execute on function public.get_account_deletion_preview() from public, anon;
grant execute on function public.get_account_deletion_preview() to authenticated;

-- Hand over or remove everything that would block deleting p_user, in one
-- transaction. Service role only (the delete-account edge function). Safe to
-- run twice: a second run finds nothing left to move.
create or replace function public.prepare_account_deletion(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan jsonb := public.account_deletion_plan(p_user);
  x jsonb;
  r record;
  v_next uuid;
  v_left text;
begin
  if p_user is null then
    raise exception 'prepare_account_deletion: user is required';
  end if;

  -- Clubs
  for x in select * from jsonb_array_elements(v_plan->'clubs') loop
    if x->>'action' = 'transfer' then
      update public.clubs set created_by = (x->'to'->>'id')::uuid where id = (x->>'id')::uuid;
      update public.club_members set role = 'owner'
        where club_id = (x->>'id')::uuid and user_id = (x->'to'->>'id')::uuid;
    else
      delete from public.clubs where id = (x->>'id')::uuid;
    end if;
  end loop;

  -- Tournaments (those in a deleted club are already gone)
  for x in select * from jsonb_array_elements(v_plan->'tournaments') loop
    if x->>'action' = 'transfer' then
      update public.tournaments set created_by = (x->'to'->>'id')::uuid where id = (x->>'id')::uuid;
    else
      delete from public.tournaments where id = (x->>'id')::uuid;
    end if;
  end loop;

  -- Upcoming events: hand to the co-host (who stops being a co-host), or cancel
  -- (the events trigger notifies attending players).
  for x in select * from jsonb_array_elements(v_plan->'events') loop
    if x->>'action' = 'transfer' then
      update public.events set created_by = (x->'to'->>'id')::uuid where id = (x->>'id')::uuid;
      delete from public.event_cohosts where event_id = (x->>'id')::uuid and user_id = (x->'to'->>'id')::uuid;
    else
      update public.events set cancelled_at = now() where id = (x->>'id')::uuid and cancelled_at is null;
    end if;
  end loop;

  -- Past and cancelled events stay, without a host. (events.created_by would
  -- otherwise cascade and delete them for everyone who played.)
  update public.events set created_by = null where created_by = p_user;

  update public.event_cohosts set added_by = user_id where added_by = p_user;

  -- Tournament teams they captain: next member becomes captain, else none.
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

  -- Every remaining foreign key to the person must cascade or set null; fail
  -- (and roll all of the above back) if a NO ACTION / RESTRICT one still points at them.
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
      raise exception 'prepare_account_deletion: %.% still references the user', r.tbl, r.col;
    end if;
  end loop;

  return v_plan;
end;
$$;
revoke execute on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
