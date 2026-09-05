SET local check_function_bodies = off;

REVOKE ALL ON FUNCTION "public"."resolve_memory_review"(uuid, text) FROM "anon";

REVOKE ALL ON TABLE "public"."agent_tool_runs" FROM "anon";

CREATE TABLE "public"."meeting_followups" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    uuid                     NOT NULL,
  "meeting_id" uuid                     NOT NULL,
  "action_key" text                     NOT NULL,
  "kind"       text                     NOT NULL,
  "choice"     jsonb                    NOT NULL,
  "result_id"  uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "meeting_followups_kind_check" CHECK ((kind = ANY (ARRAY['task'::text, 'waiting'::text, 'event'::text, 'reference'::text]))),
  CONSTRAINT "meeting_followups_pkey" PRIMARY KEY (id),
  CONSTRAINT "meeting_followups_user_id_action_key_key" UNIQUE (user_id, action_key)
);

ALTER TABLE "public"."meeting_followups"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."meeting_followups"
  ADD CONSTRAINT "meeting_followups_meeting_id_fkey" FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;

ALTER TABLE "public"."meeting_followups"
  ADD CONSTRAINT "meeting_followups_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE POLICY "own_followups" ON "public"."meeting_followups"
  FOR ALL
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1
   FROM public.meetings
  WHERE ((meetings.id = meeting_followups.meeting_id) AND (meetings.user_id = ( SELECT auth.uid() AS uid)))))))
  WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (EXISTS ( SELECT 1
   FROM public.meetings
  WHERE ((meetings.id = meeting_followups.meeting_id) AND (meetings.user_id = ( SELECT auth.uid() AS uid)))))));

REVOKE ALL ON TABLE "public"."agent_tool_runs" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."agent_tool_runs" TO "authenticated";

REVOKE ALL ON TABLE "public"."meeting_followups" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."meeting_followups" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."meeting_followups" TO "postgres", "service_role";
