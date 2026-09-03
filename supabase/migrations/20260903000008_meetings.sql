-- 0008_meetings: 회의·전사 세그먼트 (ARCHITECTURE 5.5)

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '회의',
  status text not null default 'recording' check (status in ('recording', 'processing', 'ready', 'failed')),
  provider text not null default 'muse',
  final_pass_status text not null default 'pending' check (final_pass_status in ('pending', 'running', 'done', 'skipped', 'failed')),
  final_pass_progress jsonb not null default '{"done":0,"total":0}'::jsonb,
  speaker_map jsonb not null default '{}'::jsonb,
  audio_local_key text,
  audio_mime text,
  audio_uploaded_path text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_sec int,
  calendar_event_id uuid,
  keywords text[] not null default '{}',
  summary jsonb,
  summary_md text,
  summary_version int not null default 0,
  summary_model text,
  bookmarks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select core.enable_owner_rls('public.meetings');
create index meetings_user_started_idx on public.meetings (user_id, started_at desc);

create table public.transcript_segments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  pass text not null default 'live' check (pass in ('live', 'final')),
  seq int not null default 0,
  chunk_index int,
  turn_id int,
  start_ms int not null,
  end_ms int not null,
  raw_speaker text,
  speaker text,
  text text not null default '',
  status text not null default 'ok' check (status in ('ok', 'failed')),
  raw jsonb,
  created_at timestamptz not null default now()
);
select core.enable_owner_rls('public.transcript_segments');
create index transcript_segments_meeting_idx on public.transcript_segments (meeting_id, pass, start_ms);
create unique index transcript_segments_live_seq_idx on public.transcript_segments (meeting_id, pass, seq, turn_id) where pass = 'live';
alter publication supabase_realtime add table public.meetings;
alter publication supabase_realtime add table public.transcript_segments;
