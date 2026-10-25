-- vteam pulls Austin volleyball sessions from Schelagg's public feed.
--
-- Schelagg (github.com/bryanw121/schelagg) is independent of this database: it
-- has no credentials here and never writes here. It publishes every sport and
-- region at a public URL; this function fetches that feed, keeps only
-- sport = volleyball / region = austin, upserts external_sessions, and deletes
-- upcoming rows that are no longer in the feed (cancellations).
--
-- Safety:
--   - The URL is fixed (no parameter), and EXECUTE is revoked from every client
--     role: only pg_cron (postgres) runs it. No outbound request is client-driven.
--   - A stale feed (generatedAt older than 12h) is not ingested, so rows age out
--     and the app's EXTERNAL_SESSION_MAX_AGE_MS guard hides them.
--   - A feed with no Austin volleyball rows deletes nothing (a broken feed must
--     not wipe the table).
-- Idempotent: safe to re-run.

create extension if not exists http with schema extensions;

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
    id, source_id, title, venue, city, surface, session_type, level, price,
    starts_at, ends_at, signup_url, signup_label, note, canceled, verified_at, updated_at
  )
  select
    o->>'id',
    o->>'source_id',
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
    and o->>'region' = 'austin'
    and coalesce(o->>'id', '') <> ''
    and coalesce(o->>'title', '') <> ''
    and coalesce(o->>'venue', '') <> ''
    and o->>'starts_at' is not null
  on conflict (id) do update set
    source_id = excluded.source_id,
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
  return n;
end;
$$;

revoke all on function public.ingest_schelagg_feed() from public, anon, authenticated;

-- Hourly at :25, after Schelagg's :13 scrape has published.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'ingest-schelagg-feed') then
    perform cron.unschedule('ingest-schelagg-feed');
  end if;
  perform cron.schedule('ingest-schelagg-feed', '25 * * * *', 'select public.ingest_schelagg_feed()');
end;
$$;
