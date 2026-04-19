-- Hosts can mark discussion messages as announcements (highlighted in the app).
alter table public.event_comments
  add column if not exists is_announcement boolean not null default false;

comment on column public.event_comments.is_announcement is
  'When true, message is shown as a host announcement in the event discussion. Only the event creator may set this.';

drop policy if exists "event_comments_insert_own" on public.event_comments;

create policy "event_comments_insert_own"
  on public.event_comments for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (
      not is_announcement
      or exists (
        select 1
        from public.events e
        where e.id = event_comments.event_id
          and e.created_by = auth.uid()
      )
    )
  );
