-- Push delivery receipts.
--
-- send-chat-push stores each Expo ticket id here; check-push-receipts reads the
-- receipts 15+ minutes later, deletes tokens reported as DeviceNotRegistered, and
-- clears the rows. Only the service role touches this table.

create table if not exists public.push_receipts (
  ticket_id text primary key,
  token text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_receipts_created_at_idx on public.push_receipts (created_at);

alter table public.push_receipts enable row level security;
-- No policies: anon/authenticated get nothing; the service role bypasses RLS.

-- Schedule check-push-receipts every 30 minutes.
-- Needs two Vault secrets (Dashboard → Project Settings → Vault, or SQL below):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service-role-key>', 'service_role_key');
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_cron/pg_net not installed; schedule check-push-receipts manually';
    return;
  end if;
  -- Without both secrets the job would just fail every 30 minutes; schedule it once they exist
  -- by re-running this block.
  if not exists (select 1 from pg_extension where extname = 'supabase_vault') then
    raise notice 'Vault not installed; check-push-receipts not scheduled';
    return;
  end if;
  if (select count(*) from vault.secrets where name in ('project_url', 'service_role_key')) < 2 then
    raise notice 'Vault secrets project_url / service_role_key missing; check-push-receipts not scheduled yet';
    return;
  end if;

  perform cron.unschedule(jobid) from cron.job where jobname = 'vclub-check-push-receipts';
  perform cron.schedule(
    'vclub-check-push-receipts',
    '*/30 * * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/check-push-receipts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
        ),
        body := '{}'::jsonb
      );
    $job$
  );
end
$$;
