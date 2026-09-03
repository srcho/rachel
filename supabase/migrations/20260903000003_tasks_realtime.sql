-- 0003: 칸반 실시간 동기화 — cards·board_columns 변경을 Realtime 으로 발행(RLS 적용)
alter publication supabase_realtime add table public.cards;
alter publication supabase_realtime add table public.board_columns;
alter table public.cards replica identity full;
