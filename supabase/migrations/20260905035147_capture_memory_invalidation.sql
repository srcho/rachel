create or replace function public.invalidate_capture_memories()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP='UPDATE' and new.raw_text is not distinct from old.raw_text and new.triage is not distinct from old.triage then return new; end if;
  update public.memories m set status='archived', invalidated_at=now(), valid_until=now(), confirmed_at=null
    where m.user_id=old.user_id and m.invalidated_at is null and exists (
      select 1 from jsonb_array_elements(case when jsonb_typeof(m.source)='array' then m.source else jsonb_build_array(m.source) end) s
      where s->>'type'='capture' and s->>'id'=old.id::text
    );
  delete from public.search_chunks where user_id=old.user_id and source_type='capture' and source_id=old.id::text;
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
create trigger invalidate_capture_memories after update of raw_text, triage or delete on public.captures
for each row execute function public.invalidate_capture_memories();
revoke all on function public.invalidate_capture_memories() from public;

-- Remove legacy review candidates from the search index as well.
delete from public.search_chunks c where c.source_type='memory' and not exists (
  select 1 from public.memories m where m.id::text=c.source_id and m.user_id=c.user_id
    and m.status='active' and m.review_against is null and m.invalidated_at is null
);

-- New/updated keyword chunks remain searchable while their embeddings retry.
create or replace function public.search_chunks_hybrid(
  p_user_id uuid, p_embedding extensions.vector(1536), p_query text,
  p_k int default 10, p_types text[] default null
) returns table (id uuid, source_type text, source_id text, chunk_index int, content text, metadata jsonb, score float)
language sql stable set search_path = '' as $$
  select c.id,c.source_type,c.source_id,c.chunk_index,c.content,c.metadata,
    (0.7 * coalesce(1 - (c.embedding operator(extensions.<=>) p_embedding),0)
      + 0.3 * extensions.similarity(c.content,p_query))::float as score
  from public.search_chunks c
  where c.user_id=p_user_id and (p_types is null or c.source_type=any(p_types))
  order by score desc limit p_k
$$;
