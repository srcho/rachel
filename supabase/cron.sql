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

-- 15분마다: 연결된 사용자마다 calendar.sync 잡 등록(dedupe)
select cron.unschedule(jobname) from cron.job where jobname = 'rachel-calendar-sync';
select cron.schedule(
  'rachel-calendar-sync',
  '*/15 * * * *',
  $$
  select public.enqueue_job('calendar.sync', '{}'::jsonb, 'calendar.sync:' || i.user_id::text, now(), i.user_id)
  from public.integrations i
  where i.provider = 'google_calendar' and i.status = 'connected'
  $$
);

-- 06:00 KST(= 21:00 UTC 전날) 브리핑 생성: 프로필이 있는 사용자마다
select cron.unschedule(jobname) from cron.job where jobname = 'rachel-daily-brief';
select cron.schedule(
  'rachel-daily-brief',
  '0 21 * * *',
  $$
  select public.enqueue_job('insights.brief', '{}'::jsonb, 'insights.brief:' || p.id::text || ':' || to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD'), now(), p.id)
  from public.profiles p
  $$
);

-- 일요일 20:00 KST(= 11:00 UTC) 주간 리뷰
select cron.unschedule(jobname) from cron.job where jobname = 'rachel-weekly-review';
select cron.schedule(
  'rachel-weekly-review',
  '0 11 * * 0',
  $$
  select public.enqueue_job('insights.weekly', '{}'::jsonb, 'insights.weekly:' || p.id::text || ':' || to_char(now() at time zone 'Asia/Seoul', 'IYYY-IW'), now(), p.id)
  from public.profiles p
  $$
);
