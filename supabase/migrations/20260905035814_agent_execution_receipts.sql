alter table public.agent_tool_runs
  add column turn_key text,
  add column thread_id uuid references public.chat_threads(id) on delete set null,
  add column tool_name text,
  add column input jsonb,
  add column error_message text,
  add column updated_at timestamptz not null default now(),
  add column reconciled_at timestamptz;
create index agent_tool_runs_thread_recent on public.agent_tool_runs(user_id, thread_id, created_at desc);
create index agent_tool_runs_turn on public.agent_tool_runs(user_id, turn_key);
create trigger set_updated_at before update on public.agent_tool_runs
for each row execute function core.set_updated_at();

-- A client cannot move an existing message to another thread or promote its role.
-- Protect old user messages too, including those outside the current 200-message window.
create function public.guard_chat_message_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.chat_threads t where t.id = new.thread_id and t.user_id = new.user_id) then
    raise exception 'thread not found';
  end if;
  if tg_op = 'UPDATE' then
    if new.thread_id <> old.thread_id or new.user_id <> old.user_id or new.role <> old.role then
      raise exception 'message identity cannot change';
    end if;
    if old.role = 'user' and new.parts is distinct from old.parts then
      raise exception 'stored user message cannot change';
    end if;
  end if;
  return new;
end $$;
create trigger guard_chat_message_identity before insert or update on public.chat_messages
for each row execute function public.guard_chat_message_identity();
revoke all on function public.guard_chat_message_identity() from public;

create function public.search_chat_threads(p_query text default '', p_offset integer default 0, p_limit integer default 20)
returns table(thread jsonb, total_count bigint)
language sql stable set search_path = '' as $$
  select to_jsonb(t), count(*) over()
  from public.chat_threads t
  where t.user_id = (select auth.uid()) and (
    p_query = '' or strpos(lower(coalesce(t.title,'')),lower(p_query)) > 0
    or exists (select 1 from public.chat_messages m, lateral jsonb_array_elements(m.parts) part
      where m.thread_id = t.id and m.user_id = (select auth.uid())
        and m.role in ('user','assistant') and part->>'type' = 'text'
        and strpos(lower(coalesce(part->>'text','')),lower(p_query)) > 0))
  order by t.last_message_at desc, t.id
  limit greatest(1,least(p_limit,100)) offset greatest(0,p_offset);
$$;
revoke all on function public.search_chat_threads(text,integer,integer) from public;
grant execute on function public.search_chat_threads(text,integer,integer) to authenticated, service_role;
