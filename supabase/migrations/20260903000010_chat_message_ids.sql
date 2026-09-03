-- 0010: AI SDK UI 메시지 id 는 uuid 가 아니다 → text
alter table public.chat_messages alter column id drop default;
alter table public.chat_messages alter column id type text using id::text;
alter table public.chat_threads alter column summary_upto_message_id type text using summary_upto_message_id::text;
