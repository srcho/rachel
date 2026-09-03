-- 0013_notify: 웹 푸시 구독
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  failures int not null default 0
);
select core.enable_owner_rls('public.push_subscriptions');
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
