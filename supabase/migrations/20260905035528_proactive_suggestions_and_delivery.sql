create table public.assistant_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dedupe_key text not null,
  kind text not null check (kind in ('time_conflict','capacity_risk','meeting_followup','waiting_followup','changed_evidence','preference')),
  priority integer not null default 1,
  title text not null,
  body text not null,
  href text not null,
  evidence jsonb not null default '{}',
  proposal jsonb,
  status text not null default 'pending' check (status in ('pending','snoozed','dismissed','accepted','obsolete')),
  snoozed_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,dedupe_key)
);
create index assistant_suggestions_pending on public.assistant_suggestions(user_id,status,priority desc);
create trigger assistant_suggestions_updated before update on public.assistant_suggestions for each row execute function core.set_updated_at();

create table public.assistant_preference_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  correction_key text not null,
  preference_key text not null check (preference_key in ('preferredStartHour','defaultDurationMinutes')),
  value integer not null,
  evidence jsonb not null,
  created_at timestamptz not null default now(),
  unique(user_id,correction_key,preference_key)
);

create table public.notification_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  snoozed_until timestamptz,
  disabled_suggestion_kinds text[] not null default '{}'
);
create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dedupe_key text not null,
  kind text not null,
  local_date date not null,
  status text not null default 'attempted' check (status in ('attempted','sent','uncertain')),
  sent_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique(user_id,dedupe_key)
);
create index notification_daily_limit on public.notification_deliveries(user_id,local_date,kind);

alter table public.assistant_suggestions enable row level security;
alter table public.assistant_preference_corrections enable row level security;
alter table public.notification_controls enable row level security;
alter table public.notification_deliveries enable row level security;
revoke all on public.assistant_suggestions,public.assistant_preference_corrections,public.notification_controls,public.notification_deliveries from anon;
grant select,insert,update,delete on public.assistant_suggestions,public.assistant_preference_corrections,public.notification_controls,public.notification_deliveries to authenticated;
create policy own_suggestions on public.assistant_suggestions to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy own_preference_corrections on public.assistant_preference_corrections to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy own_notification_controls on public.notification_controls to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy own_notification_deliveries on public.notification_deliveries to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

-- One durable attempt per semantic notification, max two additional proactive
-- attempts per user's local day. An uncertain network result still spends its
-- slot, so retrying a job cannot duplicate an already-delivered notification.
create function public.claim_notification_delivery(p_user_id uuid,p_key text,p_kind text,p_at timestamptz,p_timezone text,p_suggestion_id uuid default null)
returns uuid language plpgsql security invoker set search_path=public as $$
declare delivery_id uuid; prefs jsonb; controls public.notification_controls; suggestion public.assistant_suggestions;
begin
  if auth.uid() is not null and auth.uid()<>p_user_id then raise exception 'not authorized'; end if;
  perform pg_advisory_xact_lock(hashtextextended('notification:'||p_user_id::text,0));
  select settings into prefs from public.profiles where id=p_user_id;
  select * into controls from public.notification_controls where user_id=p_user_id;
  if controls.snoozed_until>p_at or prefs->'notifications'->>p_kind='false' then return null; end if;
  if p_kind='proactive' then
    if coalesce(prefs->'assistant'->>'initiative','important')='on_request' then return null; end if;
    select * into suggestion from public.assistant_suggestions where id=p_suggestion_id and user_id=p_user_id;
    if not found or suggestion.status not in ('pending','snoozed') or suggestion.snoozed_until>p_at or suggestion.kind=any(controls.disabled_suggestion_kinds) then return null; end if;
    if (select count(*) from public.notification_deliveries where user_id=p_user_id and kind='proactive' and local_date=(p_at at time zone p_timezone)::date)>=2 then return null; end if;
  end if;
  insert into public.notification_deliveries(user_id,dedupe_key,kind,local_date)
    values(p_user_id,p_key,p_kind,(p_at at time zone p_timezone)::date)
    on conflict(user_id,dedupe_key) do nothing returning id into delivery_id;
  return delivery_id;
end $$;
revoke all on function public.claim_notification_delivery(uuid,text,text,timestamptz,text,uuid) from public,anon;
grant execute on function public.claim_notification_delivery(uuid,text,text,timestamptz,text,uuid) to authenticated,service_role;

-- Apply only the accepted, persisted candidate, preserving unrelated settings.
create function public.resolve_preference_suggestion(p_id uuid,p_user_id uuid,p_accept boolean,p_version timestamptz)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare suggestion public.assistant_suggestions; prefs jsonb; field text; value integer;
begin
  if auth.uid() is not null and auth.uid()<>p_user_id then raise exception 'not authorized'; end if;
  select * into suggestion from public.assistant_suggestions where id=p_id and user_id=p_user_id for update;
  if not found or suggestion.kind<>'preference' then raise exception 'suggestion not found'; end if;
  if suggestion.status in ('accepted','dismissed') then return jsonb_build_object('changed',false,'status',suggestion.status); end if;
  if suggestion.updated_at<>p_version then raise exception 'suggestion changed'; end if;
  if p_accept then
    field:=suggestion.proposal->>'key'; value:=(suggestion.proposal->>'value')::integer;
    if not ((field='preferredStartHour' and value between 0 and 23) or (field='defaultDurationMinutes' and value between 5 and 480)) then raise exception 'invalid preference'; end if;
    select settings into prefs from public.profiles where id=p_user_id for update;
    prefs:=coalesce(prefs,'{}');
    prefs:=jsonb_set(prefs,'{assistant}',coalesce(prefs->'assistant','{}'),true);
    prefs:=jsonb_set(prefs,'{assistant,scheduling}',coalesce(prefs#>'{assistant,scheduling}','{}'),true);
    prefs:=jsonb_set(prefs,array['assistant','scheduling',field],to_jsonb(value),true);
    update public.profiles set settings=prefs where id=p_user_id;
  end if;
  update public.assistant_suggestions set status=case when p_accept then 'accepted' else 'dismissed' end where id=p_id;
  return jsonb_build_object('changed',true,'status',case when p_accept then 'accepted' else 'dismissed' end);
end $$;
revoke all on function public.resolve_preference_suggestion(uuid,uuid,boolean,timestamptz) from public,anon;
grant execute on function public.resolve_preference_suggestion(uuid,uuid,boolean,timestamptz) to authenticated,service_role;
