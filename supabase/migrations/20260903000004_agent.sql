-- 0004_agent: 레이첼 대화 스레드·메시지 (ARCHITECTURE 5.6)

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text,
  scope jsonb,
  summary text,
  summary_upto_message_id uuid,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select core.enable_owner_rls('public.chat_threads');
create index chat_threads_user_recent_idx on public.chat_threads (user_id, last_message_at desc);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  parts jsonb not null default '[]'::jsonb,
  tokens int,
  created_at timestamptz not null default now()
);
select core.enable_owner_rls('public.chat_messages');
create index chat_messages_thread_idx on public.chat_messages (thread_id, created_at);
