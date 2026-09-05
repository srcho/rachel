-- Provider/validation runs before this call. Delete + insert roll back together on any failure.
create function public.replace_final_transcript_chunk(p_meeting_id uuid, p_chunk_index integer, p_turns jsonb)
returns setof public.transcript_segments
language plpgsql set search_path = '' as $$
begin
  if p_chunk_index < 0 or jsonb_typeof(p_turns) <> 'array' or jsonb_array_length(p_turns) = 0 then
    raise exception 'nonempty transcript chunk required';
  end if;
  perform 1 from public.meetings m where m.id = p_meeting_id and m.user_id = (select auth.uid()) for update;
  if not found then raise exception 'meeting not found'; end if;
  delete from public.transcript_segments where meeting_id = p_meeting_id and user_id = (select auth.uid())
    and pass = 'final' and chunk_index = p_chunk_index;
  return query insert into public.transcript_segments
    (user_id, meeting_id, pass, seq, chunk_index, turn_id, start_ms, end_ms, raw_speaker, speaker, text, status)
  select (select auth.uid()), p_meeting_id, 'final', p_chunk_index, p_chunk_index,
    t.turn_id, t.start_ms, t.end_ms, t.raw_speaker, null, t.text, 'ok'
  from jsonb_to_recordset(p_turns) as t(turn_id integer, start_ms integer, end_ms integer, raw_speaker text, text text)
  returning *;
end $$;
revoke all on function public.replace_final_transcript_chunk(uuid,integer,jsonb) from public;
grant execute on function public.replace_final_transcript_chunk(uuid,integer,jsonb) to authenticated;
