alter table public.memories
  add column valid_from timestamptz not null default now(),
  add column valid_until timestamptz,
  add column invalidated_at timestamptz,
  add column index_status text not null default 'ready' check (index_status in ('ready', 'pending'));
update public.memories set index_status = 'pending' where embedding is null;
-- Historical manual rows were also written by the model. Their confirmation cannot be proven.
update public.memories set confirmed_at = null where confirmed_at is not null
  and not (source @> '{"evidence":"explicit_user"}'::jsonb);

create or replace function public.invalidate_meeting_memories()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' and (to_jsonb(new)->'content_version') is not distinct from (to_jsonb(old)->'content_version') then
    return new;
  end if;
  update public.memories m set status='archived', invalidated_at=now(), valid_until=now(), confirmed_at=null
  where m.user_id=old.user_id and m.invalidated_at is null and exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(m.source)='array' then m.source else jsonb_build_array(m.source) end) s
    where s->>'type'='meeting' and s->>'id'=old.id::text
  );
  delete from public.search_chunks where user_id=old.user_id and source_type='meeting' and source_id=old.id::text;
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
create trigger invalidate_meeting_memories after update or delete on public.meetings
for each row execute function public.invalidate_meeting_memories();
revoke all on function public.invalidate_meeting_memories() from public;

-- Reject delayed extraction from an obsolete version, even if its job was already running.
create or replace function public.validate_memory_source()
returns trigger language plpgsql set search_path = '' as $$
declare s jsonb; meeting_version text;
begin
  if new.status <> 'active' then return new; end if;
  if new.invalidated_at is not null then raise exception 'memory source invalidated'; end if;
  for s in select value from jsonb_array_elements(case when jsonb_typeof(new.source)='array' then new.source else jsonb_build_array(new.source) end)
  loop
    if s->>'type'='meeting' then
      select to_jsonb(m)->>'content_version' into meeting_version from public.meetings m
        where m.id::text=s->>'id' and m.user_id=new.user_id for share;
      if not found or s->>'version' is null or s->>'version' is distinct from meeting_version then
        raise exception 'memory source version conflict';
      end if;
    end if;
  end loop;
  return new;
end $$;
create trigger validate_memory_source before insert or update of source, status on public.memories
for each row execute function public.validate_memory_source();
revoke all on function public.validate_memory_source() from public;

create or replace function public.clear_changed_memory_index()
returns trigger language plpgsql set search_path = '' as $$
begin
  delete from public.search_chunks where user_id=old.user_id and source_type='memory' and source_id=old.id::text;
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
create trigger clear_changed_memory_index after update of content, status, review_against, invalidated_at or delete on public.memories
for each row execute function public.clear_changed_memory_index();
revoke all on function public.clear_changed_memory_index() from public;

create or replace function public.resolve_memory_review(p_id uuid, p_choice text)
returns void language plpgsql set search_path = '' as $$
declare other_id uuid;
begin
  if p_choice not in ('replace','keep','discard') then raise exception 'invalid choice'; end if;
  select review_against into other_id from public.memories
    where id=p_id and user_id=(select auth.uid()) and status='active' and invalidated_at is null for update;
  if not found or other_id is null then raise exception 'memory review not found'; end if;
  if p_choice='replace' then
    update public.memories set status='archived',valid_until=now()
      where id=other_id and user_id=(select auth.uid());
  end if;
  update public.memories set review_against=null,
    confirmed_at=case when p_choice='discard' then null else now() end,
    valid_until=case when p_choice='discard' then now() else null end,
    status=case when p_choice='discard' then 'archived' else 'active' end
    where id=p_id and user_id=(select auth.uid());
end $$;
revoke all on function public.resolve_memory_review(uuid,text) from public, anon;
grant execute on function public.resolve_memory_review(uuid,text) to authenticated, service_role;
