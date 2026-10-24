-- Index every single-column foreign key in public that has no index starting with it.
--
-- RLS policies here mostly filter on these columns (user_id, created_by, event_id,
-- club_id, conversation_id), and Supabase's RLS guide measures an index on a policy
-- column at 100x+ on large tables. Postgres does not index foreign keys automatically.
-- Matches the database advisor's "unindexed_foreign_keys" check. Safe to re-run.
--
-- Note: plain CREATE INDEX locks writes on the table while it builds. Fine at current
-- table sizes; for very large tables run CREATE INDEX CONCURRENTLY outside a transaction.

do $$
declare
  fk record;
  idx_name text;
begin
  for fk in
    select c.conrelid::regclass as tbl,
           n.nspname as schema_name,
           cl.relname as table_name,
           a.attname as col
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and n.nspname = 'public'
      and array_length(c.conkey, 1) = 1
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid
          and i.indkey[0] = c.conkey[1]   -- an index whose first column is the FK column
      )
  loop
    idx_name := left(format('%s_%s_fkey_idx', fk.table_name, fk.col), 63);
    raise notice 'creating index % on %(%)', idx_name, fk.table_name, fk.col;
    execute format('create index if not exists %I on %I.%I (%I)', idx_name, fk.schema_name, fk.table_name, fk.col);
  end loop;
end
$$;
