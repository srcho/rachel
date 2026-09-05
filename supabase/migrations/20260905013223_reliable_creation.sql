ALTER TABLE "public"."captures"
  DROP CONSTRAINT "captures_status_check";

ALTER TABLE "public"."calendar_events"
  ADD COLUMN "creation_key" text;

ALTER TABLE "public"."cards"
  ADD COLUMN "creation_key" text;

ALTER TABLE "public"."memories"
  ADD COLUMN "creation_key" text;

ALTER TABLE "public"."captures"
  ADD CONSTRAINT "captures_status_check" CHECK ((status = ANY (ARRAY['inbox'::text, 'triaged'::text, 'resolving'::text, 'resolved'::text, 'dismissed'::text])));

CREATE UNIQUE INDEX calendar_events_creation_key_unique ON public.calendar_events USING btree (user_id, creation_key)
  WHERE (creation_key IS NOT NULL);

CREATE UNIQUE INDEX cards_creation_key_unique ON public.cards USING btree (user_id, creation_key)
  WHERE (creation_key IS NOT NULL);

CREATE UNIQUE INDEX memories_creation_key_unique ON public.memories USING btree (user_id, creation_key)
  WHERE (creation_key IS NOT NULL);
