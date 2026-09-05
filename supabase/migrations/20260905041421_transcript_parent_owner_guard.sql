-- The segment owner must also own the referenced meeting, not merely the child row.
create function public.guard_transcript_parent_owner() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.meetings m where m.id = new.meeting_id and m.user_id = new.user_id) then
    raise exception 'meeting not found';
  end if;
  return new;
end $$;
revoke all on function public.guard_transcript_parent_owner() from public;
create trigger guard_transcript_parent_owner before insert or update of meeting_id, user_id on public.transcript_segments
for each row execute function public.guard_transcript_parent_owner();
