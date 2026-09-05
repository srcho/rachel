REVOKE ALL ON TABLE "public"."meeting_followups" FROM "anon";

ALTER TABLE "public"."chat_messages"
  ADD COLUMN "metadata" jsonb;
