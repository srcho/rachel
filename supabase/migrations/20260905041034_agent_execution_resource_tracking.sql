-- Track resource effects in the same transaction as the write, including direct UI deletes.
alter table public.agent_tool_runs
  add column resource_tracking boolean not null default false,
  add column resource_id uuid,
  add column resource_deleted_at timestamptz;
-- Older uncertain receipts cannot prove that an absent resource was never created.
alter table public.agent_tool_runs alter column resource_tracking set default true;
create index agent_tool_runs_resource on public.agent_tool_runs(user_id, resource_id) where resource_id is not null;

create function public.track_agent_created_resource() returns trigger
language plpgsql set search_path = '' as $$
declare
  item jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  tool text := case tg_table_name when 'cards' then 'tasks.create' when 'calendar_events' then 'calendar.createEvent'
    when 'meetings' then 'meetings.createNote' when 'captures' then 'capture.add' end;
begin
  if tg_op = 'INSERT' then
    -- A delayed original worker must not resurrect a resource deleted after another worker committed it.
    if exists (select 1 from public.agent_tool_runs r
      where r.user_id = (item->>'user_id')::uuid and r.tool_name = tool
        and r.resource_deleted_at is not null
        and (case when tg_table_name in ('cards','calendar_events') then r.input->>'creationKey' = item->>'creation_key'
          else r.input->>'id' = item->>'id' end)) then
      raise exception 'previously created resource was deleted';
    end if;
    if tg_when = 'BEFORE' then return new; end if;
    update public.agent_tool_runs r set resource_id = (item->>'id')::uuid
      where r.user_id = (item->>'user_id')::uuid and r.tool_name = tool
        and r.resource_tracking
        and (case when tg_table_name in ('cards','calendar_events') then r.input->>'creationKey' = item->>'creation_key'
          else r.input->>'id' = item->>'id' end);
  elsif tg_op = 'DELETE' or (tg_table_name = 'calendar_events' and item->>'deleted_at' is not null) then
    update public.agent_tool_runs r set resource_deleted_at = coalesce(r.resource_deleted_at, now())
      where r.user_id = (item->>'user_id')::uuid and r.tool_name = tool and r.resource_id = (item->>'id')::uuid;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.track_agent_created_resource() from public;
create trigger track_agent_created_resource after insert or delete on public.cards
for each row execute function public.track_agent_created_resource();
create trigger track_agent_created_resource after insert or delete or update of deleted_at on public.calendar_events
for each row execute function public.track_agent_created_resource();
create trigger track_agent_created_resource after insert or delete on public.meetings
for each row execute function public.track_agent_created_resource();
create trigger track_agent_created_resource after insert or delete on public.captures
for each row execute function public.track_agent_created_resource();

create trigger guard_agent_created_resource before insert on public.cards
for each row execute function public.track_agent_created_resource();
create trigger guard_agent_created_resource before insert on public.calendar_events
for each row execute function public.track_agent_created_resource();
create trigger guard_agent_created_resource before insert on public.meetings
for each row execute function public.track_agent_created_resource();
create trigger guard_agent_created_resource before insert on public.captures
for each row execute function public.track_agent_created_resource();

-- A new receipt can reuse an already committed key without an INSERT firing on the resource.
create function public.bind_agent_existing_resource() returns trigger
language plpgsql set search_path = '' as $$
declare item jsonb; resource_table text; lookup_column text; lookup_value text;
begin
  resource_table := case new.tool_name when 'tasks.create' then 'cards' when 'calendar.createEvent' then 'calendar_events'
    when 'meetings.createNote' then 'meetings' when 'capture.add' then 'captures' end;
  if resource_table is null then return new; end if;
  lookup_column := case when resource_table in ('cards','calendar_events') then 'creation_key' else 'id' end;
  lookup_value := case when lookup_column = 'creation_key' then new.input->>'creationKey' else new.input->>'id' end;
  execute format('select to_jsonb(t) from public.%I t where t.user_id = $1 and t.%I::text = $2', resource_table, lookup_column)
    into item using new.user_id, lookup_value;
  if item is not null then
    new.resource_id := (item->>'id')::uuid;
    new.resource_deleted_at := (item->>'deleted_at')::timestamptz;
  end if;
  return new;
end $$;
revoke all on function public.bind_agent_existing_resource() from public;
create trigger bind_agent_existing_resource before insert on public.agent_tool_runs
for each row execute function public.bind_agent_existing_resource();
