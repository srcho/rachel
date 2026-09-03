-- 0002_tasks: 칸반 보드·컬럼·카드 (ARCHITECTURE 5.3)

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  position text not null default 'a0',
  is_default boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select core.enable_owner_rls('public.boards');
create index boards_user_idx on public.boards (user_id, position);
create unique index boards_one_default_idx on public.boards (user_id) where is_default and archived_at is null;

create table public.board_columns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null,
  position text not null,
  wip_limit int,
  is_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select core.enable_owner_rls('public.board_columns');
create index board_columns_board_idx on public.board_columns (user_id, board_id, position);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  column_id uuid not null references public.board_columns(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 500),
  description_md text not null default '',
  position text not null,
  priority smallint not null default 2 check (priority between 0 and 3),
  due_at timestamptz,
  due_has_time boolean not null default false,
  labels text[] not null default '{}',
  checklist jsonb not null default '[]'::jsonb,
  source jsonb not null default '{"type":"manual"}'::jsonb,
  calendar_event_id uuid,
  meeting_id uuid,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select core.enable_owner_rls('public.cards');
create index cards_column_pos_idx on public.cards (user_id, column_id, position) where archived_at is null;
create index cards_due_idx on public.cards (user_id, due_at) where completed_at is null and archived_at is null;
create index cards_labels_idx on public.cards using gin (labels);
create index cards_meeting_idx on public.cards (meeting_id) where meeting_id is not null;
