-- Existing timestamp ties cannot reconstruct their original semantic order.
-- New rows get an immutable insertion sequence; upserts retain the stored sequence.
alter table public.chat_messages add column message_seq bigint generated always as identity;
create index chat_messages_page_order on public.chat_messages(thread_id, created_at desc, message_seq desc);
