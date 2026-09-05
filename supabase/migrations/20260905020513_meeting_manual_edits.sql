SET local check_function_bodies = off;

REVOKE ALL ON FUNCTION "public"."merge_calendar_events"(jsonb, uuid) FROM "anon";

ALTER TABLE "public"."meetings"
  ADD COLUMN "summary_edits" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "public"."meetings"
  ADD COLUMN "transcript_edits" jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.preserve_meeting_summary_edits()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if new.summary is not null then
    new.summary := new.summary || new.summary_edits;
    if new.summary_edits ? 'decisions' then new.summary := new.summary || '{"decisionSources": []}'::jsonb; end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.set_meeting_transcript_edit (
  p_meeting_id uuid,
  p_key        text,
  p_text       text
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$ begin
  if length(p_text) > 10000 or length(trim(p_text)) = 0 then raise exception 'invalid transcript edit'; end if;
  update public.meetings set transcript_edits = transcript_edits || jsonb_build_object(p_key, p_text)
    where id = p_meeting_id and user_id = (select auth.uid());
  if not found then raise exception 'meeting not found'; end if;
end $function$;

ALTER TABLE "public"."meetings"
  ADD CONSTRAINT "meetings_summary_edits_object" CHECK ((jsonb_typeof(summary_edits) = 'object'::text));

ALTER TABLE "public"."meetings"
  ADD CONSTRAINT "meetings_transcript_edits_object" CHECK ((jsonb_typeof(transcript_edits) = 'object'::text));

CREATE TRIGGER preserve_meeting_summary_edits
  BEFORE INSERT OR UPDATE OF summary, summary_edits ON public.meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.preserve_meeting_summary_edits();

REVOKE ALL ON FUNCTION "public"."preserve_meeting_summary_edits"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."preserve_meeting_summary_edits"() TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."set_meeting_transcript_edit"(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."set_meeting_transcript_edit"(uuid, text, text) TO "anon", "authenticated", "postgres", "service_role";
