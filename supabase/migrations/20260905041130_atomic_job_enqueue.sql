-- Atomic, owner-scoped pending deduplication. Running jobs may schedule their
-- next stage with the same key; completed work does not consume future keys.
drop index public.jobs_dedupe_pending_idx;
create unique index jobs_dedupe_pending_idx on public.jobs (user_id, dedupe_key)
  nulls not distinct where status='pending' and dedupe_key is not null;

create or replace function public.enqueue_job(
  p_type text,
  p_payload jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_run_at timestamptz default now(),
  p_user_id uuid default null
) returns uuid language plpgsql set search_path='' as $$
declare v_id uuid;
begin
  insert into public.jobs(user_id,type,payload,dedupe_key,run_at)
    values(coalesce(p_user_id,auth.uid()),p_type,p_payload,p_dedupe_key,p_run_at)
    on conflict(user_id,dedupe_key) where status='pending' and dedupe_key is not null
    do update set dedupe_key=excluded.dedupe_key
    returning id into v_id;
  return v_id;
end $$;
