alter table public.meetings add column note_text text;
alter table public.meetings add column content_version integer not null default 1;
-- Recover the complete original from pre-existing manual notes before generated text changes.
update public.meetings set note_text = summary_md
where audio_local_key is null and final_pass_status = 'skipped'
  and summary_model is null and summary_md is not null;
create function public.bump_meeting_content_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.content_version := old.content_version + 1;
  return new;
end $$;
create trigger bump_meeting_content_version before update on public.meetings
for each row execute function public.bump_meeting_content_version();
revoke all on function public.bump_meeting_content_version() from public;
