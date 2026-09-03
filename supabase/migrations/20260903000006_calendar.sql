-- 0006_calendar: Google Calendar 미러 + Vault 시크릿 래퍼 (ARCHITECTURE 5.4·8장)

create table public.calendars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  external_id text not null,
  name text not null,
  color text,
  is_primary boolean not null default false,
  selected boolean not null default false,
  writable boolean not null default false,
  sync_token text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_id, external_id)
);
select core.enable_owner_rls('public.calendars');
create index calendars_user_idx on public.calendars (user_id, selected);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  calendar_id uuid not null references public.calendars(id) on delete cascade,
  external_id text not null,
  etag text,
  title text not null default '',
  description text,
  location text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  timezone text,
  recurring_event_id text,
  attendees jsonb not null default '[]'::jsonb,
  status text not null default 'confirmed',
  html_link text,
  sync_status text not null default 'synced' check (sync_status in ('synced', 'pending_push', 'conflict')),
  remote_updated_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (calendar_id, external_id)
);
select core.enable_owner_rls('public.calendar_events');
create index calendar_events_user_start_idx on public.calendar_events (user_id, start_at) where deleted_at is null;
create index calendar_events_pending_idx on public.calendar_events (user_id) where sync_status = 'pending_push';
alter publication supabase_realtime add table public.calendar_events;

-- ── Vault 래퍼: refresh token 은 vault 에만 저장. integrations.vault_secret_id 로 참조 ──
-- 호출자: 사용자 세션(auth.uid()) 또는 service_role(잡). 그 외는 거부.
create or replace function core.assert_owner(p_user_id uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
begin
  if auth.uid() is not distinct from p_user_id then return; end if;
  if v_role = 'service_role' then return; end if;
  raise exception 'not allowed' using errcode = '42501';
end $$;

create or replace function public.integration_secret_set(p_integration_id uuid, p_secret text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_old uuid;
  v_id uuid;
begin
  select user_id, vault_secret_id into v_user, v_old from public.integrations where id = p_integration_id;
  if v_user is null then raise exception 'integration not found'; end if;
  perform core.assert_owner(v_user);
  if v_old is not null then
    perform vault.update_secret(v_old, p_secret);
    return v_old;
  end if;
  v_id := vault.create_secret(p_secret, 'integration:' || p_integration_id::text);
  update public.integrations set vault_secret_id = v_id, updated_at = now() where id = p_integration_id;
  return v_id;
end $$;

create or replace function public.integration_secret_get(p_integration_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_secret_id uuid;
  v_secret text;
begin
  select user_id, vault_secret_id into v_user, v_secret_id from public.integrations where id = p_integration_id;
  if v_user is null then raise exception 'integration not found'; end if;
  perform core.assert_owner(v_user);
  if v_secret_id is null then return null; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where id = v_secret_id;
  return v_secret;
end $$;

create or replace function public.integration_secret_delete(p_integration_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_secret_id uuid;
begin
  select user_id, vault_secret_id into v_user, v_secret_id from public.integrations where id = p_integration_id;
  if v_user is null then return; end if;
  perform core.assert_owner(v_user);
  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
    update public.integrations set vault_secret_id = null where id = p_integration_id;
  end if;
end $$;

revoke execute on function public.integration_secret_set(uuid, text) from public, anon;
revoke execute on function public.integration_secret_get(uuid) from public, anon;
revoke execute on function public.integration_secret_delete(uuid) from public, anon;
