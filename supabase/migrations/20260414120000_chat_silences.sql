-- Per-user list of accounts whose chat messages this user wants hidden (DM + club).
-- Does not block event visibility or DMs server-side; client hides message content.

create table public.chat_silences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  silenced_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, silenced_user_id),
  constraint chat_silences_no_self check (user_id <> silenced_user_id)
);

create index chat_silences_user_id_idx on public.chat_silences (user_id);

alter table public.chat_silences enable row level security;

grant select, insert, delete on public.chat_silences to authenticated;

create policy "chat_silences_select_own"
  on public.chat_silences for select
  to authenticated
  using (auth.uid() = user_id);

create policy "chat_silences_insert_own"
  on public.chat_silences for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "chat_silences_delete_own"
  on public.chat_silences for delete
  to authenticated
  using (auth.uid() = user_id);
