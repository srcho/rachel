-- 0011_capture: 빠른 캡처 인박스 (PRD 5.7)
create table public.captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  raw_text text not null,
  origin text not null default 'text' check (origin in ('text', 'voice', 'share')),
  url text,
  status text not null default 'inbox' check (status in ('inbox', 'triaged', 'resolved', 'dismissed')),
  triage jsonb,
  resolved_ref jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select core.enable_owner_rls('public.captures');
create index captures_user_status_idx on public.captures (user_id, status, created_at desc);
alter publication supabase_realtime add table public.captures;
