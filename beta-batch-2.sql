-- vteam: BETA (CI) database only, project uifolvbwtrbcmfrvelnl. Do NOT run on live.
-- Run after beta-batch-1.sql. Two more PR migrations: #115 (I've paid) and #116 (club home court).

-- ===== beta-apply-b2-pr115-20261028120000_event_payments.sql
-- Run on BETA only (uifolvbwtrbcmfrvelnl) for PR #115
select beta_meta.apply_pr_migration(115, '20261028180000_event_payments.sql', $up$
-- #6: "I've paid" self-toggle for paid events.
--
-- A row means "this attendee says they've paid for this event". It lives in its
-- own table, not a column on event_attendees, because attendee rows are public
-- (guests read rosters) while payment status is only for the attendee and the
-- event's host and co-hosts. Presence is the flag: the attendee inserts their
-- own row to mark paid and deletes it to clear. Nobody else can write it, and
-- there is no UPDATE.
--
-- Leaving the event removes the attendee row, which removes the flag
-- (ON DELETE CASCADE), so a re-join starts unpaid.
-- Additive only: a new table, policies and grants.

create table public.event_payments (
  event_id uuid not null,
  user_id  uuid not null,
  paid_at  timestamptz not null default now(),
  primary key (event_id, user_id),
  foreign key (event_id, user_id)
    references public.event_attendees (event_id, user_id) on delete cascade
);

comment on table public.event_payments is
  'Self-reported "I''ve paid" flags for paid events (#6). Row present = attendee marked paid. Readable by the attendee and the event host/co-hosts.';

alter table public.event_payments enable row level security;

-- The attendee sees their own flag; the host and co-hosts see everyone's.
create policy event_payments_select on public.event_payments
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.events e
      where e.id = event_payments.event_id and e.created_by = (select auth.uid())
    )
    or exists (
      select 1 from public.event_cohosts c
      where c.event_id = event_payments.event_id and c.user_id = (select auth.uid())
    )
  );

-- Only for yourself, only on a paid event, only while you're on its roster
-- (attending or waitlisted).
create policy event_payments_insert_own on public.event_payments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.events e
      where e.id = event_payments.event_id and e.price > 0
    )
    and exists (
      select 1 from public.event_attendees a
      where a.event_id = event_payments.event_id
        and a.user_id = (select auth.uid())
        and a.status in ('attending', 'waitlisted')
    )
  );

create policy event_payments_delete_own on public.event_payments
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.event_payments from anon, authenticated;
grant select, delete on public.event_payments to authenticated;
-- paid_at always comes from the default, never the client.
grant insert (event_id, user_id) on public.event_payments to authenticated;
$up$, $down$
-- Undo 20261028180000_event_payments.sql
drop table if exists public.event_payments;
$down$);

-- ===== beta-apply-b2-pr116-20261028130000_club_place_location.sql
-- Run on BETA only (uifolvbwtrbcmfrvelnl) for PR #116
select beta_meta.apply_pr_migration(116, '20261028180100_club_place_location.sql', $up$
-- #13: a club can have any geocoded location (Google Places), not just a
-- curated metro. The metro (major_city_id → major_cities) stays required: it is
-- what Clubs discovery groups and searches by, and the app pre-fills it from
-- the chosen place when the place is in a curated metro.
--
-- All new columns are nullable (clubs without a fixed home court, and every
-- club created by the app version currently installed). Additive only.

alter table public.clubs
  add column if not exists location_name    text,
  add column if not exists location_address text,
  add column if not exists latitude         double precision,
  add column if not exists longitude        double precision,
  add column if not exists place_id         text;

alter table public.clubs
  add constraint clubs_location_name_len    check (location_name is null or char_length(location_name) between 1 and 200),
  add constraint clubs_location_address_len check (location_address is null or char_length(location_address) <= 300),
  add constraint clubs_place_id_len         check (place_id is null or char_length(place_id) between 1 and 300),
  add constraint clubs_coords_valid check (
    (latitude is null and longitude is null)
    or (latitude between -90 and 90 and longitude between -180 and 180)
  ),
  -- Coordinates or an address only make sense with a name to show.
  add constraint clubs_location_has_name check (
    location_name is not null or (location_address is null and latitude is null and place_id is null)
  );

comment on column public.clubs.location_name    is 'Home court / meeting place name shown on the club page (#13). Null = no fixed location.';
comment on column public.clubs.location_address is 'Formatted address of the club location, from Google Places or the curated venue list.';
comment on column public.clubs.latitude         is 'Club location latitude (WGS84), from Google Places details. Null when unknown.';
comment on column public.clubs.longitude        is 'Club location longitude (WGS84), from Google Places details. Null when unknown.';
comment on column public.clubs.place_id         is 'Google Places place_id of the club location, when it came from Places search.';
$up$, $down$
-- Undo 20261028180100_club_place_location.sql
alter table public.clubs
  drop constraint if exists clubs_location_has_name,
  drop constraint if exists clubs_coords_valid,
  drop constraint if exists clubs_place_id_len,
  drop constraint if exists clubs_location_address_len,
  drop constraint if exists clubs_location_name_len;

alter table public.clubs
  drop column if exists place_id,
  drop column if exists longitude,
  drop column if exists latitude,
  drop column if exists location_address,
  drop column if exists location_name;
$down$);

