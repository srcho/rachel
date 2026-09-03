-- 프로덕션 pg_cron 스케줄. 시크릿은 Vault 에서 읽는다(값은 커밋하지 않는다):
--   select vault.create_secret('<https://앱/api/jobs/run>', 'rachel_jobs_url');
--   select vault.create_secret('<CRON_SECRET>', 'rachel_cron_secret');
-- 적용: pnpm supabase db query --linked -f supabase/cron.sql

select cron.unschedule(jobname) from cron.job where jobname = 'rachel-jobs';

select cron.schedule(
  'rachel-jobs',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'rachel_jobs_url'),
    headers := jsonb_build_object(
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'rachel_cron_secret'),
      'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000)
  $$
);
