-- Court surface on club events, with the same values as external_sessions.surface
-- (fed by Schelagg), so the Events feed can filter club events and outside
-- sessions together. Optional: null means the host didn't say.
-- Idempotent.
alter table public.events add column if not exists surface text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_surface_check' and conrelid = 'public.events'::regclass) then
    alter table public.events add constraint events_surface_check check (surface is null or surface in ('indoor', 'sand', 'grass'));
  end if;
end $$;
comment on column public.events.surface is 'Court surface: indoor, sand or grass (null = not set). Same values as external_sessions.surface so the feed can filter both.';
