-- 0015: 카드 ↔ Google Tasks 링크(단방향 미러 + 완료/제목/마감 되돌려 받기)
create table if not exists public.google_task_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  tasklist_id text not null,
  gtask_id text not null,
  last_pushed_at timestamptz,
  last_pulled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, card_id),
  unique (user_id, gtask_id)
);
create index if not exists google_task_links_user_gtask on public.google_task_links (user_id, gtask_id);
select core.enable_owner_rls('google_task_links');
create trigger google_task_links_touch before update on public.google_task_links
  for each row execute function core.set_updated_at();
