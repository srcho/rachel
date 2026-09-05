ALTER TABLE "public"."cards"
  ADD COLUMN "repeat_rule" jsonb;

ALTER TABLE "public"."cards"
  ADD COLUMN "repeat_parent_id" uuid;

ALTER TABLE "public"."cards"
  ADD CONSTRAINT "cards_repeat_rule_valid"
    CHECK
    (((repeat_rule IS NULL) OR ((jsonb_typeof(repeat_rule) = 'object'::text) AND ((repeat_rule ->> 'kind'::text) = ANY (ARRAY['weekly'::text, 'after_completion'::text])) AND
    ((((repeat_rule ->> 'interval'::text))::integer >= 1) AND (((repeat_rule ->> 'interval'::text))::integer <= 365)) AND
    ((((repeat_rule ->> 'weekday'::text))::integer >= 0) AND (((repeat_rule ->> 'weekday'::text))::integer <= 6)))));

CREATE UNIQUE INDEX cards_repeat_parent_unique ON public.cards USING btree (user_id, repeat_parent_id)
  WHERE (repeat_parent_id IS NOT NULL);
