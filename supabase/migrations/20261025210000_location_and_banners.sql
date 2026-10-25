-- Location setting + one-time banners, and outside sessions for every region.
--
-- 1. user_settings: private per-user settings (owner-only RLS), not on the
--    public profiles row.
--      home_city_id  the viewer's metro (major_cities); the feed shows outside
--                    sessions for its region. Null = the pilot default (Austin).
--      seen_banners  ids of one-time banners already shown to this user, so a
--                    banner seen on one device doesn't show on another.
-- 2. external_sessions.region: Schelagg's region slug ('austin', ...). Existing
--    rows are Austin (column default).
-- 3. ingest_schelagg_feed() keeps volleyball sessions for every region (was
--    Austin only) and stores the region; the app filters by the viewer's city.
--    It also prunes sessions that started over a week ago.
-- No UPDATE/DELETE/DROP statements at top level (they need interactive
-- confirmation through the Supabase connector).
-- Idempotent.

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  home_city_id uuid references public.major_cities (id) on delete set null,
  seen_banners text[] not null default '{}',
  updated_at timestamptz not null default now()
);
create index if not exists user_settings_home_city_id_idx on public.user_settings (home_city_id);

alter table public.user_settings enable row level security;
-- Created only when missing (no DROP POLICY), so re-running is a no-op.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_settings' and policyname = 'Users read own settings') then
    create policy "Users read own settings" on public.user_settings
      for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_settings' and policyname = 'Users insert own settings') then
    create policy "Users insert own settings" on public.user_settings
      for insert to authenticated with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_settings' and policyname = 'Users update own settings') then
    create policy "Users update own settings" on public.user_settings
      for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
end $$;
revoke all on public.user_settings from anon;

-- The default fills existing rows (all Austin) without an UPDATE; the ingest
-- always sets region explicitly from the feed.
alter table public.external_sessions add column if not exists region text not null default 'austin';
create index if not exists external_sessions_region_starts_at_idx on public.external_sessions (region, starts_at);

create or replace function public.ingest_schelagg_feed()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  feed_url constant text := 'https://bryanw121.github.io/schelagg/data/occurrences.json';
  res extensions.http_response;
  feed jsonb;
  run_at timestamptz := now();
  n integer;
begin
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '20000');
  select * into res from extensions.http_get(feed_url);
  if res.status <> 200 then
    raise exception 'schelagg feed: HTTP % from %', res.status, feed_url;
  end if;
  feed := res.content::jsonb;
  if coalesce((feed->>'feedVersion')::int, 0) <> 1 then
    raise exception 'schelagg feed: unsupported feedVersion %', feed->>'feedVersion';
  end if;
  if (feed->>'generatedAt')::timestamptz < run_at - interval '12 hours' then
    raise notice 'schelagg feed is stale (generated %); not ingesting', feed->>'generatedAt';
    return 0;
  end if;

  insert into public.external_sessions as es (
    id, source_id, region, title, venue, city, surface, session_type, level, price,
    starts_at, ends_at, signup_url, signup_label, note, canceled, verified_at, updated_at
  )
  select
    o->>'id',
    o->>'source_id',
    o->>'region',
    o->>'title',
    o->>'venue',
    nullif(o->>'city', ''),
    case when o->'attributes'->>'surface' in ('indoor', 'sand', 'grass') then o->'attributes'->>'surface' end,
    o->'attributes'->>'type',
    o->>'level',
    o->>'price',
    (o->>'starts_at')::timestamptz,
    (o->>'ends_at')::timestamptz,
    o->>'signup_url',
    o->>'signup_label',
    o->>'note',
    coalesce((o->>'canceled')::boolean, false),
    (o->>'verified_at')::date,
    run_at
  from jsonb_array_elements(coalesce(feed->'occurrences', '[]'::jsonb)) as o
  where o->>'sport' = 'volleyball'
    and coalesce(o->>'region', '') <> ''
    and coalesce(o->>'id', '') <> ''
    and coalesce(o->>'title', '') <> ''
    and coalesce(o->>'venue', '') <> ''
    and o->>'starts_at' is not null
  on conflict (id) do update set
    source_id = excluded.source_id,
    region = excluded.region,
    title = excluded.title,
    venue = excluded.venue,
    city = excluded.city,
    surface = excluded.surface,
    session_type = excluded.session_type,
    level = excluded.level,
    price = excluded.price,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    signup_url = excluded.signup_url,
    signup_label = excluded.signup_label,
    note = excluded.note,
    canceled = excluded.canceled,
    verified_at = excluded.verified_at,
    updated_at = excluded.updated_at;
  get diagnostics n = row_count;

  if n > 0 then
    delete from public.external_sessions
    where updated_at < run_at and starts_at >= run_at;
  end if;
  -- Prune sessions that started more than a week ago so the table doesn't grow forever.
  delete from public.external_sessions where starts_at < run_at - interval '7 days';
  return n;
end;
$$;

revoke all on function public.ingest_schelagg_feed() from public, anon, authenticated;
