-- 0005_memory: 레이첼 장기 기억 + 검색 인덱스 (ARCHITECTURE 5.6·6.3)

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('fact', 'preference', 'person', 'decision', 'goal', 'routine')),
  content text not null check (char_length(content) between 1 and 2000),
  embedding extensions.vector(1536),
  importance smallint not null default 3 check (importance between 1 and 5),
  source jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'archived')),
  pinned boolean not null default false,
  last_used_at timestamptz,
  use_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select core.enable_owner_rls('public.memories');
create index memories_user_idx on public.memories (user_id, status, kind);
create index memories_embedding_idx on public.memories using hnsw (embedding extensions.vector_cosine_ops);

create table public.search_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_type text not null,
  source_id text not null,
  chunk_index int not null default 0,
  content text not null,
  embedding extensions.vector(1536),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, source_type, source_id, chunk_index)
);
select core.enable_owner_rls('public.search_chunks');
create index search_chunks_embedding_idx on public.search_chunks using hnsw (embedding extensions.vector_cosine_ops);
create index search_chunks_trgm_idx on public.search_chunks using gin (content extensions.gin_trgm_ops);
create index search_chunks_source_idx on public.search_chunks (user_id, source_type, source_id);

-- 유사 기억 검색. RLS 적용(security invoker). 서비스 롤은 p_user_id 로 스코프.
create or replace function public.match_memories(
  p_user_id uuid,
  p_embedding extensions.vector(1536),
  p_k int default 8,
  p_min_similarity float default 0.3,
  p_include_archived boolean default false
) returns table (id uuid, kind text, content text, importance smallint, pinned boolean, source jsonb, similarity float)
language sql stable set search_path = '' as $$
  select m.id, m.kind, m.content, m.importance, m.pinned, m.source,
         1 - (m.embedding operator(extensions.<=>) p_embedding) as similarity
  from public.memories m
  where m.user_id = p_user_id
    and m.embedding is not null
    and (p_include_archived or m.status = 'active')
    and 1 - (m.embedding operator(extensions.<=>) p_embedding) >= p_min_similarity
  order by m.embedding operator(extensions.<=>) p_embedding
  limit p_k
$$;

-- 하이브리드 검색: 벡터 0.7 + trgm 0.3
create or replace function public.search_chunks_hybrid(
  p_user_id uuid,
  p_embedding extensions.vector(1536),
  p_query text,
  p_k int default 10,
  p_types text[] default null
) returns table (id uuid, source_type text, source_id text, chunk_index int, content text, metadata jsonb, score float)
language sql stable set search_path = '' as $$
  select c.id, c.source_type, c.source_id, c.chunk_index, c.content, c.metadata,
         (0.7 * (1 - (c.embedding operator(extensions.<=>) p_embedding)) + 0.3 * extensions.similarity(c.content, p_query))::float as score
  from public.search_chunks c
  where c.user_id = p_user_id
    and c.embedding is not null
    and (p_types is null or c.source_type = any (p_types))
  order by score desc
  limit p_k
$$;
