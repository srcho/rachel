-- 0016: 카드 삭제 시 링크가 먼저 사라져 Google 쪽 항목을 못 지우고(다음 pull 에서 새 카드로 재유입) → FK 캐스케이드 제거.
-- 링크는 push 잡이 Google 항목을 지운 뒤 스스로 정리한다. 고아 링크는 pull 에서 카드가 없으면 무시된다.
alter table public.google_task_links drop constraint if exists google_task_links_card_id_fkey;
