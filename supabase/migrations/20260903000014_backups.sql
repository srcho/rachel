-- 0014: 주간 백업 버킷(private). 경로 <user_id>/<date>.json.gz
insert into storage.buckets (id, name, public, file_size_limit)
values ('backups', 'backups', false, 104857600)
on conflict (id) do nothing;

create policy "backups_owner_select" on storage.objects for select to authenticated
  using (bucket_id = 'backups' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "backups_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'backups' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "backups_owner_update" on storage.objects for update to authenticated
  using (bucket_id = 'backups' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'backups' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "backups_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'backups' and (storage.foldername(name))[1] = (select auth.uid())::text);
