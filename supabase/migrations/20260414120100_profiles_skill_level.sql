-- Optional self-reported skill tier; hosts see it on the event People tab for team balancing.
alter table public.profiles
  add column if not exists skill_level text;

alter table public.profiles
  drop constraint if exists profiles_skill_level_valid;

alter table public.profiles
  add constraint profiles_skill_level_valid check (
    skill_level is null
    or skill_level in (
      'recreational',
      'beginner',
      'intermediate',
      'advanced',
      'competitive'
    )
  );

comment on column public.profiles.skill_level is
  'Self-reported volleyball skill tier; hosts and co-hosts see it when managing attendees.';
