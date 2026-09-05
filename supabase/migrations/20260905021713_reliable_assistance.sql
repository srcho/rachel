SET local check_function_bodies = off;

CREATE TABLE "public"."agent_tool_runs" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "request_key" text                     NOT NULL,
  "status"      text                     NOT NULL DEFAULT 'running'::text,
  "output"      jsonb,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "agent_tool_runs_pkey" PRIMARY KEY (id),
  CONSTRAINT "agent_tool_runs_status_check" CHECK ((status = ANY (ARRAY['running'::text, 'done'::text, 'uncertain'::text]))),
  "user_id"     uuid                     NOT NULL DEFAULT auth.uid(),
  CONSTRAINT "agent_tool_runs_user_id_request_key_key" UNIQUE (user_id, request_key)
);

ALTER TABLE "public"."agent_tool_runs"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."calendar_events"
  ADD COLUMN "google_has_reminders" boolean NOT NULL DEFAULT true;

ALTER TABLE "public"."memories"
  ADD COLUMN "review_against" uuid;

ALTER TABLE "public"."memories"
  ADD COLUMN "confirmed_at" timestamp WITH time zone;

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
  insert into public.calendar_events as existing (user_id, calendar_id, external_id, etag, title, description, location, start_at, end_at, all_day, timezone, recurring_event_id, attendees, status, html_link, remote_updated_at, deleted_at, is_busy, google_has_reminders, sync_status)
  select p_user_id, r.calendar_id, r.external_id, r.etag, coalesce(r.title,''), r.description, r.location, r.start_at, r.end_at, coalesce(r.all_day,false), r.timezone, r.recurring_event_id, coalesce(r.attendees,'[]'::jsonb), coalesce(r.status,'confirmed'), r.html_link, r.remote_updated_at, r.deleted_at, coalesce(r.is_busy,true), coalesce(r.google_has_reminders,true), 'synced'
  from jsonb_populate_recordset(null::public.calendar_events, p_rows) r
  join public.calendars c on c.id = r.calendar_id and c.user_id = p_user_id
  on conflict (calendar_id, external_id) do update set
    etag = case when existing.sync_status = 'synced' then excluded.etag else existing.etag end, title = case when existing.sync_status = 'synced' then excluded.title else existing.title end, description = case when existing.sync_status = 'synced' then excluded.description else existing.description end, location = case when existing.sync_status = 'synced' then excluded.location else existing.location end, start_at = case when existing.sync_status = 'synced' then excluded.start_at else existing.start_at end, end_at = case when existing.sync_status = 'synced' then excluded.end_at else existing.end_at end, all_day = case when existing.sync_status = 'synced' then excluded.all_day else existing.all_day end, timezone = case when existing.sync_status = 'synced' then excluded.timezone else existing.timezone end, recurring_event_id = case when existing.sync_status = 'synced' then excluded.recurring_event_id else existing.recurring_event_id end, attendees = case when existing.sync_status = 'synced' then excluded.attendees else existing.attendees end, status = case when existing.sync_status = 'synced' then excluded.status else existing.status end, html_link = case when existing.sync_status = 'synced' then excluded.html_link else existing.html_link end, remote_updated_at = case when existing.sync_status = 'synced' then excluded.remote_updated_at else existing.remote_updated_at end, deleted_at = case when existing.sync_status = 'synced' then excluded.deleted_at else existing.deleted_at end, is_busy = case when existing.sync_status = 'synced' then excluded.is_busy else existing.is_busy end,
    google_has_reminders = excluded.google_has_reminders,
    remote_snapshot = case when existing.sync_status <> 'synced' then to_jsonb(excluded) else null end,
    sync_status = case when existing.sync_status <> 'synced' and existing.etag is distinct from excluded.etag then 'conflict' else existing.sync_status end;
  get diagnostics affected = row_count;
  return affected;
end $function$;

CREATE OR REPLACE FUNCTION public.resolve_memory_review (
  p_id     uuid,
  p_choice text
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare other_id uuid;
begin
  if p_choice not in ('replace','keep','discard') then raise exception 'invalid choice'; end if;
  select review_against into other_id from public.memories where id=p_id and user_id=(select auth.uid()) for update;
  if not found or other_id is null then raise exception 'memory review not found'; end if;
  if p_choice='replace' then update public.memories set status='archived' where id=other_id and user_id=(select auth.uid()); end if;
  update public.memories set review_against=null, confirmed_at=now(), status=case when p_choice='discard' then 'archived' else 'active' end where id=p_id and user_id=(select auth.uid());
end $function$;

REVOKE ALL ON FUNCTION "public"."resolve_memory_review"(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."resolve_memory_review"(uuid, text) TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."agent_tool_runs" TO "anon", "authenticated", "postgres", "service_role";

ALTER TABLE "public"."agent_tool_runs"
  ADD CONSTRAINT "agent_tool_runs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE POLICY "agent_tool_runs_owner" ON "public"."agent_tool_runs"
  FOR ALL
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
