SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.list_meeting_records (
  p_query   text    DEFAULT ''::text,
  p_pending boolean DEFAULT false,
  p_offset  integer DEFAULT 0
)
  RETURNS TABLE (
    meeting       jsonb,
    pending_count bigint,
    total_count   bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select to_jsonb(m), coalesce(c.n, 0), count(*) over()
  from public.meetings m
  left join lateral (select count(*) n from public.cards c where c.meeting_id = m.id and c.user_id = (select auth.uid()) and c.completed_at is null and c.archived_at is null) c on true
  where m.user_id = (select auth.uid())
    and (p_query = '' or strpos(lower(m.title), lower(p_query)) > 0)
    and (not p_pending or c.n > 0)
  order by m.started_at desc, m.id
  limit 20 offset greatest(0, least(p_offset, 200000));
$function$;

REVOKE ALL ON FUNCTION "public"."list_meeting_records"(text, boolean, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."list_meeting_records"(text, boolean, integer) TO "anon", "authenticated", "postgres", "service_role";
