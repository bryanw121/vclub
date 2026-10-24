-- Volleyball sessions run by other Austin venues and groups (Volley ATX data).
--
-- The Volley ATX scraper (bryanw121/volleyball-atx, scripts/sync-vclub.mjs) upserts
-- one row per dated session after each nightly scrape and deletes future rows it
-- no longer sees. vclub only reads: the Events feed shows these next to club
-- events, with a link out to the venue's own sign-up page.

create table if not exists public.external_sessions (
  id           text primary key,              -- stable Volley ATX id, e.g. 'volleyworld-2026-10-24-19:30-pflugerville'
  source_id    text not null,                 -- 'volleyworld', 'reclub', 'aces', ...
  title        text not null,
  venue        text not null,
  city         text,
  surface      text check (surface in ('indoor', 'sand', 'grass')),
  session_type text,                          -- 'Open play', 'Training', 'League', ...
  level        text,
  price        text,                          -- display text as the venue shows it ('$12', 'Free')
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  signup_url   text,
  signup_label text,
  note         text,
  canceled     boolean not null default false,
  verified_at  date,                          -- last day the scraper saw it on the source
  updated_at   timestamptz not null default now()
);

create index if not exists external_sessions_starts_at_idx on public.external_sessions (starts_at);

alter table public.external_sessions enable row level security;

-- Public schedule data: guests and members can read it. No write policies, so
-- only the service role (the sync job) can change rows.
drop policy if exists "external_sessions are public" on public.external_sessions;
create policy "external_sessions are public"
  on public.external_sessions for select
  to anon, authenticated
  using (true);
