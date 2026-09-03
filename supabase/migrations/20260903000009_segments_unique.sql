-- 0009: transcript_segments upsert 용 유니크 제약(부분 인덱스는 ON CONFLICT 에 못 쓴다)
drop index if exists public.transcript_segments_live_seq_idx;
alter table public.transcript_segments add constraint transcript_segments_unique unique (meeting_id, pass, seq, turn_id);
