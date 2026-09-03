-- 0012: 인사이트 지표 뷰(LLM 0회). 모두 security_invoker → RLS 적용. 주는 월요일 시작(서울).
create or replace function core.week_start(ts timestamptz) returns date
language sql immutable set search_path = '' as $$
  select (date_trunc('week', ts at time zone 'Asia/Seoul'))::date
$$;

create or replace view public.v_tasks_weekly with (security_invoker = true) as
with weeks as (
  select user_id, core.week_start(created_at) as week, count(*) as created, 0::bigint as completed from public.cards group by 1, 2
  union all
  select user_id, core.week_start(completed_at), 0, count(*) from public.cards where completed_at is not null group by 1, 2
)
select user_id, week, sum(created) as created, sum(completed) as completed
from weeks group by user_id, week;

create or replace view public.v_task_cycle_time with (security_invoker = true) as
select user_id, core.week_start(completed_at) as week,
       count(*) as completed,
       round(avg(extract(epoch from (completed_at - created_at)) / 3600)::numeric, 1) as avg_hours,
       round(percentile_cont(0.5) within group (order by extract(epoch from (completed_at - created_at)) / 3600)::numeric, 1) as median_hours
from public.cards where completed_at is not null
group by user_id, core.week_start(completed_at);

create or replace view public.v_meetings_weekly with (security_invoker = true) as
select user_id, core.week_start(started_at) as week, count(*) as meetings, round(coalesce(sum(duration_sec), 0) / 60.0) as minutes
from public.meetings where status <> 'recording'
group by user_id, core.week_start(started_at);

create or replace view public.v_calendar_load_weekly with (security_invoker = true) as
select e.user_id, core.week_start(e.start_at) as week, count(*) as events,
       round(sum(extract(epoch from (e.end_at - e.start_at)) / 3600)::numeric, 1) as hours
from public.calendar_events e
join public.calendars c on c.id = e.calendar_id and c.selected
where e.deleted_at is null and not e.all_day
group by e.user_id, core.week_start(e.start_at);

create or replace view public.v_capture_conversion with (security_invoker = true) as
select user_id, core.week_start(created_at) as week, count(*) as captured,
       count(*) filter (where status = 'resolved') as resolved,
       count(*) filter (where status = 'dismissed') as dismissed
from public.captures group by user_id, core.week_start(created_at);

-- 완료 스트릭: 서울 기준 날짜별 완료 수
create or replace view public.v_completion_days with (security_invoker = true) as
select user_id, (completed_at at time zone 'Asia/Seoul')::date as day, count(*) as completed
from public.cards where completed_at is not null
group by user_id, (completed_at at time zone 'Asia/Seoul')::date;

-- 회의·일정 시간대 분포(요일 0=월 … 6=일, 시)
create or replace view public.v_event_slots with (security_invoker = true) as
select e.user_id, e.start_at,
       ((extract(isodow from e.start_at at time zone 'Asia/Seoul'))::int - 1) as dow,
       (extract(hour from e.start_at at time zone 'Asia/Seoul'))::int as hour,
       extract(epoch from (e.end_at - e.start_at)) / 3600 as hours
from public.calendar_events e
join public.calendars c on c.id = e.calendar_id and c.selected
where e.deleted_at is null and not e.all_day;
