-- Event discussion comments. Run in Supabase SQL Editor or via CLI migration.
create table public.event_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint event_comments_body_not_empty check (length(trim(body)) > 0),
  constraint event_comments_body_max check (char_length(body) <= 2000)
);

create index event_comments_event_id_created_at_idx
  on public.event_comments (event_id, created_at);

alter table public.event_comments enable row level security;

grant select, insert, delete on public.event_comments to authenticated;

create policy "event_comments_select_authenticated"
  on public.event_comments for select
  to authenticated
  using (true);

create policy "event_comments_insert_own"
  on public.event_comments for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "event_comments_delete_own"
  on public.event_comments for delete
  to authenticated
  using (auth.uid() = user_id);
