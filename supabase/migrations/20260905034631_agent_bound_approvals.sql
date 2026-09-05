create table public.agent_tool_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  turn_key text not null,
  tool_call_id text not null,
  tool_name text not null,
  input jsonb not null,
  preview jsonb not null,
  targets jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  unique (user_id, tool_call_id)
);
alter table public.agent_tool_approvals enable row level security;
revoke all on public.agent_tool_approvals from anon;
grant select, insert, update, delete on public.agent_tool_approvals to authenticated;
create policy own_approvals on public.agent_tool_approvals to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
