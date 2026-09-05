-- A delayed index worker must not reintroduce corrected or deleted source text.
create or replace function public.validate_search_chunk_source()
returns trigger language plpgsql set search_path = '' as $$
declare source_version text; memory_content text;
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
  end if;
  return new;
end $$;
create trigger validate_search_chunk_source before insert or update on public.search_chunks
for each row execute function public.validate_search_chunk_source();
revoke all on function public.validate_search_chunk_source() from public;
