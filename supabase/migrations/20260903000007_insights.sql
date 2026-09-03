-- 0007_insights: 브리핑·주간 리뷰 캐시 (ARCHITECTURE 5.7)
create table public.insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('daily_brief', 'weekly_review', 'monthly_review')),
  period_start date not null,
  period_end date not null,
  content_md text not null,
  data jsonb not null default '{}'::jsonb,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind, period_start)
);
select core.enable_owner_rls('public.insights');
