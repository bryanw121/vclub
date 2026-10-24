-- Minimum supported app versions, read by the app at startup.
-- When a release needs a breaking backend change, raise min_version for that platform
-- and older installs show an "Update vclub" screen instead of failing in odd ways.

create table if not exists public.app_config (
  platform text primary key check (platform in ('ios', 'android', 'web')),
  min_version text not null default '0.0.0',
  store_url text,
  message text,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

drop policy if exists "app_config readable by everyone" on public.app_config;
create policy "app_config readable by everyone"
  on public.app_config for select
  to anon, authenticated
  using (true);

insert into public.app_config (platform, min_version)
values ('ios', '0.0.0'), ('android', '0.0.0'), ('web', '0.0.0')
on conflict (platform) do nothing;
