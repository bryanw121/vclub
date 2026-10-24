-- RLS performance: wrap auth.uid() / auth.jwt() / auth.role() in a scalar subquery.
--
-- Postgres evaluates a bare auth.uid() once per row a policy checks. Written as
-- (select auth.uid()) it becomes an initPlan that runs once per statement.
-- Supabase's RLS performance guide measures this at 179ms -> 9ms on a 100K-row table,
-- and the database advisor flags it as "auth_rls_initplan".
--
-- This rewrites every policy in the public schema in place, keeping its name,
-- roles and command. Already-wrapped calls are left alone, so it is safe to re-run.
-- Applied by hand (Supabase SQL editor or MCP apply_migration); check the advisor afterwards.

do $$
declare
  p record;
  new_qual text;
  new_check text;
  wrap constant text := '(?<!select )\m(auth\.(uid|jwt|role))\(\)';
  stmt text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~* 'auth\.(uid|jwt|role)\(\)' or coalesce(with_check, '') ~* 'auth\.(uid|jwt|role)\(\)')
  loop
    -- pg_policies prints wrapped calls as "( SELECT auth.uid() AS uid)", so the
    -- lookbehind on "select " skips anything already wrapped.
    new_qual  := regexp_replace(p.qual,       wrap, '(select \1())', 'gi');
    new_check := regexp_replace(p.with_check, wrap, '(select \1())', 'gi');

    if new_qual is not distinct from p.qual and new_check is not distinct from p.with_check then
      continue;
    end if;

    stmt := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if new_qual is not null then stmt := stmt || format(' using (%s)', new_qual); end if;
    if new_check is not null then stmt := stmt || format(' with check (%s)', new_check); end if;

    raise notice 'rewriting policy % on %', p.policyname, p.tablename;
    execute stmt;
  end loop;
end
$$;
