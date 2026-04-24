-- Club feed posts (announcements / updates), likes, and comments.
-- Only club owners may create posts. Any club member may like or comment.

create table public.club_posts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint club_posts_body_not_empty check (length(trim(body)) > 0),
  constraint club_posts_body_max check (char_length(body) <= 4000)
);

create index club_posts_club_id_created_at_idx
  on public.club_posts (club_id, created_at desc);

create table public.club_post_likes (
  club_post_id uuid not null references public.club_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (club_post_id, user_id)
);

create index club_post_likes_user_id_idx on public.club_post_likes (user_id);

create table public.club_post_comments (
  id uuid primary key default gen_random_uuid(),
  club_post_id uuid not null references public.club_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint club_post_comments_body_not_empty check (length(trim(body)) > 0),
  constraint club_post_comments_body_max check (char_length(body) <= 2000)
);

create index club_post_comments_post_id_created_at_idx
  on public.club_post_comments (club_post_id, created_at);

alter table public.club_posts enable row level security;
alter table public.club_post_likes enable row level security;
alter table public.club_post_comments enable row level security;

grant select, insert on public.club_posts to authenticated;
grant select, insert, delete on public.club_post_likes to authenticated;
grant select, insert, delete on public.club_post_comments to authenticated;

-- Posts: members read; owners create (author must be self).
create policy "club_posts_select_members"
  on public.club_posts for select
  to authenticated
  using (
    exists (
      select 1 from public.club_members m
      where m.club_id = club_posts.club_id
        and m.user_id = auth.uid()
    )
  );

create policy "club_posts_insert_owners"
  on public.club_posts for insert
  to authenticated
  with check (
    auth.uid() = created_by
    and exists (
      select 1 from public.club_members m
      where m.club_id = club_posts.club_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );

-- Likes: members toggle own like rows on posts in their club.
create policy "club_post_likes_select_members"
  on public.club_post_likes for select
  to authenticated
  using (
    exists (
      select 1 from public.club_posts p
      join public.club_members m on m.club_id = p.club_id
      where p.id = club_post_likes.club_post_id
        and m.user_id = auth.uid()
    )
  );

create policy "club_post_likes_insert_members"
  on public.club_post_likes for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.club_posts p
      join public.club_members m on m.club_id = p.club_id
      where p.id = club_post_likes.club_post_id
        and m.user_id = auth.uid()
    )
  );

create policy "club_post_likes_delete_own"
  on public.club_post_likes for delete
  to authenticated
  using (auth.uid() = user_id);

-- Comments: members read/write own; delete own.
create policy "club_post_comments_select_members"
  on public.club_post_comments for select
  to authenticated
  using (
    exists (
      select 1 from public.club_posts p
      join public.club_members m on m.club_id = p.club_id
      where p.id = club_post_comments.club_post_id
        and m.user_id = auth.uid()
    )
  );

create policy "club_post_comments_insert_members"
  on public.club_post_comments for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.club_posts p
      join public.club_members m on m.club_id = p.club_id
      where p.id = club_post_comments.club_post_id
        and m.user_id = auth.uid()
    )
  );

create policy "club_post_comments_delete_own"
  on public.club_post_comments for delete
  to authenticated
  using (auth.uid() = user_id);

comment on table public.club_posts is 'Club-scoped feed posts; only club owners (club_members.role = owner) may create.';
comment on table public.club_post_likes is 'One row per user like on a club post.';
comment on table public.club_post_comments is 'Threaded discussion on a club post; visible to club members.';
