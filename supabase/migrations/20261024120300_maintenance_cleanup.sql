-- Keep bookkeeping tables from growing forever.
--
-- pg_cron logs every run in cron.job_run_details and pg_net keeps every HTTP response
-- in net._http_response; neither prunes itself by default. This adds one nightly job
-- (3:17am UTC) that keeps 7 days of each. Only runs the parts whose extension exists.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'vclub-maintenance-cleanup';
    perform cron.schedule(
      'vclub-maintenance-cleanup',
      '17 3 * * *',
      $job$
        delete from cron.job_run_details where end_time < now() - interval '7 days';
        do $inner$ begin
          if exists (select 1 from pg_extension where extname = 'pg_net') then
            delete from net._http_response where created < now() - interval '7 days';
          end if;
        end $inner$;
      $job$
    );
  else
    raise notice 'pg_cron not installed; skipping maintenance job';
  end if;
end
$$;
