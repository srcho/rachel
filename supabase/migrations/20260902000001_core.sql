-- 0001_core: 확장, core 스키마 헬퍼, 코어 테이블(profiles·integrations·domain_events·jobs·llm_usage·undo_tokens), 뷰, RPC
-- ARCHITECTURE.md 5.1·5.2·11장 참조

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pg_net with schema extensions;
do $$ begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron unavailable here (%): skipping', sqlerrm;
end $$;

create schema if not exists core;

-- ── 헬퍼 ────────────────────────────────────────────────────────────────
create or replace function core.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- 표준 소유자 RLS 4정책 + updated_at 트리거. owner_col 기본 user_id (profiles는 id)
create or replace function core.enable_owner_rls(tbl regclass, owner_col text default 'user_id')
returns void language plpgsql set search_path = '' as $$
declare
  rel text;
  has_updated_at boolean;
begin
  select c.relname into rel from pg_catalog.pg_class c where c.oid = tbl;
  execute format('alter table %s enable row level security', tbl);
  execute format('create policy %I on %s for select to authenticated using ((select auth.uid()) = %I)', rel || '_select', tbl, owner_col);
  execute format('create policy %I on %s for insert to authenticated with check ((select auth.uid()) = %I)', rel || '_insert', tbl, owner_col);
  execute format('create policy %I on %s for update to authenticated using ((select auth.uid()) = %I) with check ((select auth.uid()) = %I)', rel || '_update', tbl, owner_col, owner_col);
  execute format('create policy %I on %s for delete to authenticated using ((select auth.uid()) = %I)', rel || '_delete', tbl, owner_col);
  select exists (
    select 1 from pg_catalog.pg_attribute a where a.attrelid = tbl and a.attname = 'updated_at' and not a.attisdropped
  ) into has_updated_at;
  if has_updated_at then
    execute format('create trigger set_updated_at before update on %s for each row execute function core.set_updated_at()', tbl);
  end if;
end $$;

-- ── profiles ─────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Asia/Seoul',
  locale text not null default 'ko',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select core.enable_owner_rls('public.profiles', 'id');

create or replace function core.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'))
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function core.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function core.handle_new_user();

-- ── integrations ─────────────────────────────────────────────────────────
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider text not null,
  account_email text,
  scopes text[] not null default '{}',
  vault_secret_id uuid,
  sync_cursor jsonb not null default '{}'::jsonb,
  status text not null default 'connected' check (status in ('connected', 'needs_reauth', 'disconnected')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);
select core.enable_owner_rls('public.integrations');

-- ── domain_events (append-only) ──────────────────────────────────────────
create table public.domain_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null,
  entity_type text not null,
  entity_id text not null,
  payload jsonb not null default '{}'::jsonb,
  actor text not null default 'user' check (actor in ('user', 'agent', 'system')),
  occurred_at timestamptz not null default now()
);
alter table public.domain_events enable row level security;
create policy domain_events_select on public.domain_events for select to authenticated using ((select auth.uid()) = user_id);
create policy domain_events_insert on public.domain_events for insert to authenticated with check ((select auth.uid()) = user_id);
create index domain_events_user_time_idx on public.domain_events (user_id, occurred_at desc);
create index domain_events_entity_idx on public.domain_events (user_id, entity_type, entity_id);

-- ── jobs ─────────────────────────────────────────────────────────────────
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  run_at timestamptz not null default now(),
  attempts int not null default 0,
  max_attempts int not null default 3,
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select core.enable_owner_rls('public.jobs');
create index jobs_status_run_at_idx on public.jobs (status, run_at);
create unique index jobs_dedupe_pending_idx on public.jobs (dedupe_key) where status = 'pending' and dedupe_key is not null;

-- 잡 등록: pending 중복 키는 무시하고 기존 id 반환
create or replace function public.enqueue_job(
  p_type text,
  p_payload jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_run_at timestamptz default now(),
  p_user_id uuid default null
) returns uuid language plpgsql set search_path = '' as $$
declare
  v_id uuid;
  v_user uuid := coalesce(p_user_id, auth.uid());
begin
  if p_dedupe_key is not null then
    select id into v_id from public.jobs where dedupe_key = p_dedupe_key and status = 'pending' limit 1;
    if v_id is not null then
      return v_id;
    end if;
  end if;
  insert into public.jobs (user_id, type, payload, dedupe_key, run_at)
  values (v_user, p_type, p_payload, p_dedupe_key, p_run_at)
  returning id into v_id;
  return v_id;
end $$;

-- 잡 인출: 서비스 롤 전용. for update skip locked, 10분 지난 running 회수
create or replace function public.claim_jobs(p_batch int default 10)
returns setof public.jobs language plpgsql set search_path = '' as $$
begin
  return query
  with candidates as (
    select j.id from public.jobs j
    where (j.status = 'pending' and j.run_at <= now())
       or (j.status = 'running' and j.locked_at < now() - interval '10 minutes')
    order by j.run_at
    for update skip locked
    limit p_batch
  )
  update public.jobs j
  set status = 'running', locked_at = now(), attempts = j.attempts + 1, updated_at = now()
  from candidates c
  where j.id = c.id
  returning j.*;
end $$;
revoke execute on function public.claim_jobs(int) from public, anon, authenticated;

-- ── llm_usage (AI 비용 원장) ──────────────────────────────────────────────
create table public.llm_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider text not null,
  model text not null,
  feature text not null,
  input_tokens int not null default 0,
  cached_tokens int not null default 0,
  output_tokens int not null default 0,
  reasoning_tokens int not null default 0,
  audio_seconds int not null default 0,
  unit_prices jsonb,
  cost_usd numeric(10, 6) not null default 0,
  ref jsonb,
  latency_ms int,
  meta jsonb,
  created_at timestamptz not null default now()
);
select core.enable_owner_rls('public.llm_usage');
create index llm_usage_user_time_idx on public.llm_usage (user_id, created_at desc);
create index llm_usage_ref_idx on public.llm_usage using gin (ref);

create view public.v_llm_usage_monthly with (security_invoker = true) as
select user_id,
       date_trunc('month', created_at) as month,
       count(*) as calls,
       sum(input_tokens) as input_tokens,
       sum(cached_tokens) as cached_tokens,
       sum(output_tokens) as output_tokens,
       sum(audio_seconds) as audio_seconds,
       sum(cost_usd) as cost_usd
from public.llm_usage
group by user_id, date_trunc('month', created_at);

create view public.v_llm_usage_by_feature with (security_invoker = true) as
select user_id,
       date_trunc('month', created_at) as month,
       feature, provider, model,
       count(*) as calls,
       sum(input_tokens) as input_tokens,
       sum(cached_tokens) as cached_tokens,
       sum(output_tokens) as output_tokens,
       sum(audio_seconds) as audio_seconds,
       sum(cost_usd) as cost_usd
from public.llm_usage
group by user_id, date_trunc('month', created_at), feature, provider, model;

create view public.v_llm_usage_daily with (security_invoker = true) as
select user_id,
       (created_at at time zone 'Asia/Seoul')::date as day,
       count(*) as calls,
       sum(cost_usd) as cost_usd
from public.llm_usage
group by user_id, (created_at at time zone 'Asia/Seoul')::date;

-- ── undo_tokens (30초 되돌리기) ───────────────────────────────────────────
create table public.undo_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tool text not null,
  output jsonb not null,
  expires_at timestamptz not null default now() + interval '30 seconds',
  created_at timestamptz not null default now()
);
select core.enable_owner_rls('public.undo_tokens');
create index undo_tokens_user_idx on public.undo_tokens (user_id, expires_at desc);
