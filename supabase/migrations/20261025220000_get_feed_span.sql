-- The Events feed in one request.
--
-- get_feed_span(p_start, p_end, p_external_updated_since) returns everything the
-- feed shows for [p_start, p_end) as one jsonb object:
--
--   events       club events, shaped exactly like the PostgREST select
--                EVENT_CARD_LIST_SELECT (+ EVENT_CARD_MY_ATTENDANCE_SELECT when
--                signed in), ordered by event_date
--   tournaments  rows shaped like TOURNAMENT_FEED_SELECT (hooks/useMonthEvents.ts)
--   external     external_sessions rows shaped like EXTERNAL_SESSION_SELECT
--   previews     up to 3 attending attendees per event, the same rows
--                get_event_card_attendee_previews returns for those events
--
-- It replaces three parallel PostgREST queries plus a second round trip for
-- avatar previews. The client keeps that path as a fallback while this
-- function is not deployed (hooks/useMonthEvents.ts).
--
-- SECURITY INVOKER: every read goes through the caller's RLS, so a guest (anon)
-- sees what the anon SELECT policies allow and tournaments stay members-only.
-- `my_attendance` is the caller's own row (auth.uid()); the key is absent for a
-- guest, as it is when the client builds the select without the embed.
--
-- event_date is `timestamp without time zone`: PostgREST compares it with the
-- client's ISO "...Z" bounds by casting them to timestamp (dropping the zone),
-- i.e. the UTC wall time, which is what `at time zone 'UTC'` gives here.
--
-- p_external_updated_since: hide outside sessions not refreshed since then
-- (the client passes now - EXTERNAL_SESSION_MAX_AGE_MS); null = 12 hours ago.
--
-- Needs external_sessions.region (20261025210000_location_and_banners.sql).
-- Idempotent.

create or replace function public.get_feed_span(
  p_start timestamptz,
  p_end timestamptz,
  p_external_updated_since timestamptz default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with
  me as (
    select auth.uid() as uid
  ),
  span_events as (
    select e.*
    from events e
    where e.event_date >= (p_start at time zone 'UTC')
      and e.event_date < (p_end at time zone 'UTC')
      and e.cancelled_at is null
  ),
  event_json as (
    select
      e.event_date,
      jsonb_build_object(
        'id', e.id,
        'created_by', e.created_by,
        'club_id', e.club_id,
        'title', e.title,
        'location', e.location,
        'event_date', e.event_date,
        'duration_minutes', e.duration_minutes,
        'max_attendees', e.max_attendees,
        'created_at', e.created_at,
        'price', e.price,
        'requires_approval', e.requires_approval,
        'surface', e.surface,
        'profiles', (
          select jsonb_build_object(
            'id', p.id, 'username', p.username, 'first_name', p.first_name,
            'last_name', p.last_name, 'avatar_url', p.avatar_url
          )
          from profiles p
          where p.id = e.created_by
        ),
        'event_attendees_attending', jsonb_build_array(jsonb_build_object(
          'count', (select count(*) from event_attendees_attending a where a.event_id = e.id)
        )),
        'event_guests_attending', jsonb_build_array(jsonb_build_object(
          'count', (select count(*) from event_guests_attending g where g.event_id = e.id)
        )),
        'event_attendees_waitlisted', jsonb_build_array(jsonb_build_object(
          'count', (select count(*) from event_attendees_waitlisted w where w.event_id = e.id)
        )),
        'event_tags', coalesce((
          select jsonb_agg(jsonb_build_object(
            'tag_id', et.tag_id,
            'tags', (
              select jsonb_build_object(
                'id', t.id, 'name', t.name, 'category', t.category, 'display_order', t.display_order
              )
              from tags t
              where t.id = et.tag_id
            )
          ))
          from event_tags et
          where et.event_id = e.id
        ), '[]'::jsonb),
        'clubs', (
          select jsonb_build_object('id', c.id, 'name', c.name, 'avatar_url', c.avatar_url)
          from clubs c
          where c.id = e.club_id
        )
      )
      || case
           when (select uid from me) is null then '{}'::jsonb
           else jsonb_build_object('my_attendance', coalesce((
             select jsonb_agg(jsonb_build_object('user_id', ea.user_id, 'status', ea.status))
             from event_attendees ea
             where ea.event_id = e.id
               and ea.user_id = (select uid from me)
           ), '[]'::jsonb))
         end as item
    from span_events e
  ),
  tournament_json as (
    select
      t.start_date,
      jsonb_build_object(
        'id', t.id,
        'created_by', t.created_by,
        'club_id', t.club_id,
        'title', t.title,
        'location', t.location,
        'start_date', t.start_date,
        'max_teams', t.max_teams,
        'price', t.price,
        'skill_levels', t.skill_levels,
        'status', t.status,
        'created_at', t.created_at,
        'profiles', (
          select jsonb_build_object(
            'id', p.id, 'username', p.username, 'first_name', p.first_name,
            'last_name', p.last_name, 'avatar_url', p.avatar_url
          )
          from profiles p
          where p.id = t.created_by
        ),
        'clubs', (
          select jsonb_build_object('id', c.id, 'name', c.name, 'avatar_url', c.avatar_url)
          from clubs c
          where c.id = t.club_id
        )
      ) as item
    from tournaments t
    where t.start_date >= p_start
      and t.start_date < p_end
      and t.status <> 'draft'
      and t.status <> 'cancelled'
  ),
  external_json as (
    select
      s.starts_at,
      jsonb_build_object(
        'id', s.id,
        'source_id', s.source_id,
        'region', s.region,
        'title', s.title,
        'venue', s.venue,
        'city', s.city,
        'surface', s.surface,
        'session_type', s.session_type,
        'level', s.level,
        'price', s.price,
        'starts_at', s.starts_at,
        'ends_at', s.ends_at,
        'signup_url', s.signup_url,
        'signup_label', s.signup_label,
        'note', s.note,
        'verified_at', s.verified_at
      ) as item
    from external_sessions s
    where s.starts_at >= p_start
      and s.starts_at < p_end
      and s.canceled = false
      and s.updated_at >= coalesce(p_external_updated_since, now() - interval '12 hours')
  ),
  preview_json as (
    select jsonb_build_object(
      'event_id', ranked.event_id,
      'user_id', ranked.user_id,
      'username', p.username,
      'first_name', p.first_name,
      'last_name', p.last_name,
      'avatar_url', p.avatar_url
    ) as item
    from (
      select
        ea.event_id,
        ea.user_id,
        ea.joined_at,
        row_number() over (partition by ea.event_id order by ea.joined_at asc) as rn
      from event_attendees ea
      where ea.status = 'attending'
        and ea.event_id in (select id from span_events)
    ) ranked
    join profiles p on p.id = ranked.user_id
    where ranked.rn <= 3
  )
  select jsonb_build_object(
    'events',      coalesce((select jsonb_agg(item order by event_date) from event_json), '[]'::jsonb),
    'tournaments', coalesce((select jsonb_agg(item order by start_date) from tournament_json), '[]'::jsonb),
    'external',    coalesce((select jsonb_agg(item order by starts_at) from external_json), '[]'::jsonb),
    'previews',    coalesce((select jsonb_agg(item) from preview_json), '[]'::jsonb)
  );
$$;

comment on function public.get_feed_span(timestamptz, timestamptz, timestamptz) is
  'Events feed for [p_start, p_end) in one call: events (EVENT_CARD_LIST_SELECT shape + caller''s my_attendance), tournaments, external sessions, avatar previews. SECURITY INVOKER.';

grant execute on function public.get_feed_span(timestamptz, timestamptz, timestamptz) to anon, authenticated;
