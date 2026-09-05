SET local check_function_bodies = off;

ALTER TABLE "public"."calendar_events"
  ADD COLUMN "is_busy" boolean NOT NULL DEFAULT true;

ALTER TABLE "public"."calendar_events"
  ADD COLUMN "remote_snapshot" jsonb;

CREATE OR REPLACE FUNCTION public.merge_calendar_events (
  p_rows    jsonb,
  p_user_id uuid
)
  RETURNS integer
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare affected integer;
begin
  insert into public.calendar_events as existing (user_id, calendar_id, external_id, etag, title, description, location, start_at, end_at, all_day, timezone, recurring_event_id, attendees, status, html_link, remote_updated_at, deleted_at, is_busy, sync_status)
  select p_user_id, r.calendar_id, r.external_id, r.etag, coalesce(r.title,''), r.description, r.location, r.start_at, r.end_at, coalesce(r.all_day,false), r.timezone, r.recurring_event_id, coalesce(r.attendees,'[]'::jsonb), coalesce(r.status,'confirmed'), r.html_link, r.remote_updated_at, r.deleted_at, coalesce(r.is_busy,true), 'synced'
  from jsonb_populate_recordset(null::public.calendar_events, p_rows) r
  join public.calendars c on c.id = r.calendar_id and c.user_id = p_user_id
  on conflict (calendar_id, external_id) do update set
    etag = case when existing.sync_status = 'synced' then excluded.etag else existing.etag end, title = case when existing.sync_status = 'synced' then excluded.title else existing.title end, description = case when existing.sync_status = 'synced' then excluded.description else existing.description end, location = case when existing.sync_status = 'synced' then excluded.location else existing.location end, start_at = case when existing.sync_status = 'synced' then excluded.start_at else existing.start_at end, end_at = case when existing.sync_status = 'synced' then excluded.end_at else existing.end_at end, all_day = case when existing.sync_status = 'synced' then excluded.all_day else existing.all_day end, timezone = case when existing.sync_status = 'synced' then excluded.timezone else existing.timezone end, recurring_event_id = case when existing.sync_status = 'synced' then excluded.recurring_event_id else existing.recurring_event_id end, attendees = case when existing.sync_status = 'synced' then excluded.attendees else existing.attendees end, status = case when existing.sync_status = 'synced' then excluded.status else existing.status end, html_link = case when existing.sync_status = 'synced' then excluded.html_link else existing.html_link end, remote_updated_at = case when existing.sync_status = 'synced' then excluded.remote_updated_at else existing.remote_updated_at end, deleted_at = case when existing.sync_status = 'synced' then excluded.deleted_at else existing.deleted_at end, is_busy = case when existing.sync_status = 'synced' then excluded.is_busy else existing.is_busy end,
    remote_snapshot = case when existing.sync_status <> 'synced' then to_jsonb(excluded) else null end,
    sync_status = case when existing.sync_status <> 'synced' and existing.etag is distinct from excluded.etag then 'conflict' else existing.sync_status end;
  get diagnostics affected = row_count;
  return affected;
end $function$;

REVOKE ALL ON FUNCTION "public"."merge_calendar_events"(jsonb, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."merge_calendar_events"(jsonb, uuid) TO "authenticated", "postgres", "service_role";
