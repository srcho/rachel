-- pgTAP RLS 테스트: 다른 사용자의 행이 보이거나 바뀌면 실패. 실행: supabase test db
begin;
select plan(9);

-- 사용자 두 명
insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111', 'a@test.local'), ('22222222-2222-2222-2222-222222222222', 'b@test.local');

-- A 로 데이터 생성
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into public.boards (id, name, position, is_default) values ('aaaaaaaa-0000-0000-0000-000000000001', 'A 보드', 'a0', true);
insert into public.board_columns (id, board_id, name, position) values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Todo', 'a0');
insert into public.cards (id, board_id, column_id, title, position) values ('aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'A 카드', 'a0');
insert into public.memories (id, kind, content) values ('aaaaaaaa-0000-0000-0000-000000000004', 'fact', 'A 의 기억');
insert into public.meetings (id, title) values ('aaaaaaaa-0000-0000-0000-000000000005', 'A 회의');
select is((select count(*) from public.cards), 1::bigint, 'A 는 자기 카드를 본다');

-- B 로 전환
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*) from public.boards), 0::bigint, 'B 는 A 의 보드를 못 본다');
select is((select count(*) from public.cards), 0::bigint, 'B 는 A 의 카드를 못 본다');
select is((select count(*) from public.memories), 0::bigint, 'B 는 A 의 기억을 못 본다');
select is((select count(*) from public.meetings), 0::bigint, 'B 는 A 의 회의를 못 본다');
update public.cards set title = 'hacked' where id = 'aaaaaaaa-0000-0000-0000-000000000003';
select is((select count(*) from public.cards where title = 'hacked'), 0::bigint, 'B 의 UPDATE 는 0행');
delete from public.memories where id = 'aaaaaaaa-0000-0000-0000-000000000004';
select is((select count(*) from public.memories), 0::bigint, 'B 의 DELETE 는 0행(여전히 안 보임)');
-- B 가 A 의 user_id 로 insert 시도 → WITH CHECK 위반
select throws_ok($$ insert into public.cards (user_id, board_id, column_id, title, position) values ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 'B 가 A 에 삽입', 'a1') $$, '42501', null, 'B 는 A 의 user_id 로 insert 못 한다');
-- 뷰도 security_invoker
select is((select count(*) from public.v_tasks_weekly), 0::bigint, 'B 는 A 의 지표 뷰 행을 못 본다');

select * from finish();
rollback;
