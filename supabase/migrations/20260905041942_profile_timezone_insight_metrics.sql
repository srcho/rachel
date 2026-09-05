-- Metrics use each owner profile timezone, preserving view shape and RLS.
create or replace view public.v_tasks_weekly with (security_invoker = true) as
with weeks as (
  select user_id, (date_trunc('week', cards.created_at at time zone p.timezone))::date as week, count(*) as created, 0::bigint as completed from public.cards join public.profiles p on p.id=cards.user_id group by 1, 2
  union all
  select user_id, (date_trunc('week', cards.completed_at at time zone p.timezone))::date, 0, count(*) from public.cards join public.profiles p on p.id=cards.user_id where completed_at is not null group by 1, 2
)
select user_id, week, sum(created) as created, sum(completed) as completed
from weeks group by user_id, week;

create or replace view public.v_task_cycle_time with (security_invoker = true) as
select user_id, (date_trunc('week', cards.completed_at at time zone p.timezone))::date as week,
       count(*) as completed,
       round(avg(extract(epoch from (cards.completed_at - cards.created_at)) / 3600)::numeric, 1) as avg_hours,
       round(percentile_cont(0.5) within group (order by extract(epoch from (cards.completed_at - cards.created_at)) / 3600)::numeric, 1) as median_hours
from public.cards join public.profiles p on p.id=cards.user_id where completed_at is not null
group by user_id, (date_trunc('week', cards.completed_at at time zone p.timezone))::date;

create or replace view public.v_meetings_weekly with (security_invoker = true) as
select user_id, (date_trunc('week', meetings.started_at at time zone p.timezone))::date as week, count(*) as meetings, round(coalesce(sum(duration_sec), 0) / 60.0) as minutes
from public.meetings join public.profiles p on p.id=meetings.user_id where status <> 'recording'
group by user_id, (date_trunc('week', meetings.started_at at time zone p.timezone))::date;

create or replace view public.v_calendar_load_weekly with (security_invoker = true) as
select e.user_id, (date_trunc('week', e.start_at at time zone p.timezone))::date as week, count(*) as events,
       round(sum(extract(epoch from (e.end_at - e.start_at)) / 3600)::numeric, 1) as hours
from public.calendar_events e
join public.profiles p on p.id=e.user_id
join public.calendars c on c.id = e.calendar_id and c.selected
where e.deleted_at is null and not e.all_day
group by e.user_id, (date_trunc('week', e.start_at at time zone p.timezone))::date;

create or replace view public.v_capture_conversion with (security_invoker = true) as
select user_id, (date_trunc('week', captures.created_at at time zone p.timezone))::date as week, count(*) as captured,
       count(*) filter (where status = 'resolved') as resolved,
       count(*) filter (where status = 'dismissed') as dismissed
from public.captures join public.profiles p on p.id=captures.user_id group by user_id, (date_trunc('week', captures.created_at at time zone p.timezone))::date;

-- 완료 스트릭: 프로필 시간대 기준 날짜별 완료 수
create or replace view public.v_completion_days with (security_invoker = true) as
select user_id, (completed_at at time zone p.timezone)::date as day, count(*) as completed
from public.cards join public.profiles p on p.id=cards.user_id where completed_at is not null
group by user_id, (completed_at at time zone p.timezone)::date;

-- 회의·일정 시간대 분포(요일 0=월 … 6=일, 시)
create or replace view public.v_event_slots with (security_invoker = true) as
select e.user_id, e.start_at,
       ((extract(isodow from e.start_at at time zone p.timezone))::int - 1) as dow,
       (extract(hour from e.start_at at time zone p.timezone))::int as hour,
       extract(epoch from (e.end_at - e.start_at)) / 3600 as hours
from public.calendar_events e
join public.profiles p on p.id=e.user_id
join public.calendars c on c.id = e.calendar_id and c.selected
where e.deleted_at is null and not e.all_day;
