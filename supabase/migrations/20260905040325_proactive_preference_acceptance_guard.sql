create or replace function public.resolve_preference_suggestion(p_id uuid,p_user_id uuid,p_accept boolean,p_version timestamptz)
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
    if suggestion.proposal ? 'previousValue' and coalesce(prefs#>array['assistant','scheduling',field],'null'::jsonb) is distinct from suggestion.proposal->'previousValue' then raise exception 'preference changed since suggestion'; end if;
    if field='preferredStartHour' and greatest(value,coalesce((prefs#>>'{assistant,scheduling,workStartHour}')::integer,9))>=least(coalesce((prefs#>>'{assistant,scheduling,workEndHour}')::integer,19),coalesce((prefs#>>'{assistant,scheduling,preferredEndHour}')::integer,24)) then raise exception 'preferred time is outside working hours'; end if;
    prefs:=jsonb_set(prefs,'{assistant}',coalesce(prefs->'assistant','{}'),true);
    prefs:=jsonb_set(prefs,'{assistant,scheduling}',coalesce(prefs#>'{assistant,scheduling}','{}'),true);
    prefs:=jsonb_set(prefs,array['assistant','scheduling',field],to_jsonb(value),true);
    prefs:=jsonb_set(prefs,'{assistant,evidence}',jsonb_build_object('source','explicit_user','updatedAt',now(),'suggestionId',p_id,'basis','accepted_candidate'),true);
    update public.profiles set settings=prefs where id=p_user_id;
  end if;
  update public.assistant_suggestions set status=case when p_accept then 'accepted' else 'dismissed' end where id=p_id;
  return jsonb_build_object('changed',true,'status',case when p_accept then 'accepted' else 'dismissed' end);
end $$;
revoke all on function public.resolve_preference_suggestion(uuid,uuid,boolean,timestamptz) from public,anon;
grant execute on function public.resolve_preference_suggestion(uuid,uuid,boolean,timestamptz) to authenticated,service_role;

create function public.set_notification_suggestion_kind(p_user_id uuid,p_kind text,p_enabled boolean)
returns void language plpgsql security invoker set search_path=public as $$
begin
  if auth.uid() is not null and auth.uid()<>p_user_id then raise exception 'not authorized'; end if;
  if p_kind not in ('time_conflict','capacity_risk','meeting_followup','waiting_followup','changed_evidence','preference') then raise exception 'invalid kind'; end if;
  insert into public.notification_controls(user_id) values(p_user_id) on conflict(user_id) do nothing;
  update public.notification_controls set disabled_suggestion_kinds=case when p_enabled then array_remove(disabled_suggestion_kinds,p_kind) when p_kind=any(disabled_suggestion_kinds) then disabled_suggestion_kinds else array_append(disabled_suggestion_kinds,p_kind) end where user_id=p_user_id;
end $$;
revoke all on function public.set_notification_suggestion_kind(uuid,text,boolean) from public,anon;
grant execute on function public.set_notification_suggestion_kind(uuid,text,boolean) to authenticated,service_role;
