alter table public.calendars add column sync_coverage_from timestamptz;
alter table public.calendars add column sync_coverage_to timestamptz;

-- Serialize mirror writers so guarded time blocking checks the latest committed mirror.
create function public.lock_calendar_writer() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 731));
  return new;
end $$;
create trigger calendar_writer_lock before insert or update on public.calendar_events
for each row execute function public.lock_calendar_writer();
revoke all on function public.lock_calendar_writer() from public, anon;

create function public.write_calendar_event(
  p_user_id uuid, p_patch jsonb, p_id uuid default null,
  p_expected_version timestamptz default null, p_prevent_overlap boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_before public.calendar_events;
  v_next public.calendar_events;
  v_conflicts jsonb;
begin
  if auth.uid() is distinct from p_user_id and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 731));
  if p_id is not null then
    select * into v_before from public.calendar_events where id = p_id and user_id = p_user_id for update;
    if not found then raise exception 'event not found' using errcode = 'P0002'; end if;
    if p_expected_version is not null and v_before.updated_at <> p_expected_version then
      raise exception 'event version conflict' using errcode = '40001';
    end if;
    v_next := jsonb_populate_record(v_before, p_patch);
  else
    if p_patch->>'creation_key' is not null then
      select * into v_before from public.calendar_events where user_id = p_user_id and creation_key = p_patch->>'creation_key';
      if found then return jsonb_build_object('event', to_jsonb(v_before), 'createdNow', false); end if;
    end if;
    v_next := jsonb_populate_record(null::public.calendar_events, p_patch);
  end if;
  if not exists (select 1 from public.calendars where id = v_next.calendar_id and user_id = p_user_id and writable) then
    raise exception 'calendar not writable' using errcode = '42501';
  end if;
  if v_next.end_at <= v_next.start_at then raise exception 'invalid event range'; end if;
  if p_prevent_overlap and coalesce(v_next.is_busy, true) and v_next.deleted_at is null then
    select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) into v_conflicts
    from public.calendar_events e join public.calendars c on c.id = e.calendar_id
    where e.user_id = p_user_id and c.user_id = p_user_id and c.selected
      and e.id is distinct from p_id and e.deleted_at is null and e.status <> 'cancelled'
      and e.is_busy and e.start_at < v_next.end_at and e.end_at > v_next.start_at;
    if jsonb_array_length(v_conflicts) > 0 then return jsonb_build_object('conflicts', v_conflicts); end if;
  end if;
  if p_id is null then
    insert into public.calendar_events (user_id, calendar_id, external_id, creation_key, title, description, location, start_at, end_at, all_day, is_busy, timezone, sync_status)
    values (p_user_id, v_next.calendar_id, v_next.external_id, v_next.creation_key, v_next.title, v_next.description, v_next.location, v_next.start_at, v_next.end_at, coalesce(v_next.all_day,false), coalesce(v_next.is_busy,true), v_next.timezone, 'pending_push')
    returning * into v_next;
  else
    update public.calendar_events set title = v_next.title, description = v_next.description, location = v_next.location,
      start_at = v_next.start_at, end_at = v_next.end_at, all_day = v_next.all_day, is_busy = v_next.is_busy,
      deleted_at = v_next.deleted_at, sync_status = 'pending_push'
    where id = p_id and user_id = p_user_id returning * into v_next;
  end if;
  return jsonb_build_object('event', to_jsonb(v_next), 'createdNow', p_id is null);
end $$;
revoke all on function public.write_calendar_event(uuid,jsonb,uuid,timestamptz,boolean) from public, anon;
grant execute on function public.write_calendar_event(uuid,jsonb,uuid,timestamptz,boolean) to authenticated, service_role;
