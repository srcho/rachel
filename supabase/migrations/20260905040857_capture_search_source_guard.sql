-- A delayed index worker must not reintroduce corrected or deleted source text.
create or replace function public.validate_search_chunk_source()
returns trigger language plpgsql set search_path = '' as $$
declare source_version text; memory_content text; capture_version timestamptz;
begin
  if new.source_type='meeting' then
    select to_jsonb(m)->>'content_version' into source_version from public.meetings m
      where m.id::text=new.source_id and m.user_id=new.user_id for share;
    if not found or source_version is distinct from new.metadata->>'version' then
      raise exception 'search source version conflict';
    end if;
  elsif new.source_type='memory' then
    select m.content into memory_content from public.memories m
      where m.id::text=new.source_id and m.user_id=new.user_id and m.status='active'
        and m.review_against is null and m.invalidated_at is null for share;
    if not found or memory_content is distinct from new.content then
      raise exception 'search source version conflict';
    end if;
  elsif new.source_type='capture' then
    select c.raw_text,c.updated_at into memory_content,capture_version from public.captures c
      where c.id::text=new.source_id and c.user_id=new.user_id and c.status<>'dismissed' for share;
    if not found or memory_content is distinct from new.content or capture_version is distinct from (new.metadata->>'sourceVersion')::timestamptz then
      raise exception 'search source version conflict';
    end if;
  end if;
  return new;
end $$;

create function public.clear_changed_capture_index()
returns trigger language plpgsql set search_path='' as $$
begin
  if TG_OP='UPDATE' and new.raw_text is not distinct from old.raw_text and new.status is not distinct from old.status then return new; end if;
  delete from public.search_chunks where user_id=old.user_id and source_type='capture' and source_id=old.id::text;
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
create trigger clear_changed_capture_index after update of raw_text,status or delete on public.captures
for each row execute function public.clear_changed_capture_index();
revoke all on function public.clear_changed_capture_index() from public;
