# 구현 및 검증 원장

목표: 승인된 P0~P3 전체 구현, 의미 단위 커밋, 전체 코드베이스 리뷰 및 발견 사항 수정.

기준 커밋: dd3782d. 원래 기획/감사/진단은 당시 관찰 기록으로 보존한다. 현재 완료 여부는 이 원장의 실제 코드·검증 근거로 판단한다.

## 요구사항 검증

| ID | 시나리오 | 상태 | 코드·검증 근거 |
|---|---|---|---|
| A01 | 삭제 또는 일괄 변경 승인 | 구현·해당 계층 검증 | agent/approvals.test.ts: 7개 위험 변경 도구의 서버 승인 계약; BROWSER.md 승인 UI |
| A02 | 승인 거절·두 번 클릭·새로고침 | 구현·해당 계층 검증 | agent/approvals.test.ts, conversation.test.ts; BROWSER.md 승인/거절·두 번 클릭·재열기 |
| A03 | 미리보기 뒤 원본 변경·다른 대상/버전으로 승인 | 구현·해당 계층 검증 | agent/approvals.test.ts: 입력·대상 버전·사용자·턴 변경 차단 |
| A04 | 400자 초과 수동 메모 재요약·빈 전사·요약 실패 | 구현·해당 계층 검증 | meetings/assistant-contract.test.ts, diarize.test.ts: 긴 원문·빈 전사·생성 실패 보존 |
| A05 | 회의 결정·화자·전사·제목 교정 | 구현·해당 계층 검증 | meetings/assistant-contract.test.ts: 제목·결정·화자·전사 교정과 색인 일치 |
| A06 | planDate/repeatRule/dueHasTime/연결 ID 수정 | 구현·해당 계층 검증 | tasks/tools.test.ts: 수정 가능 필드 왕복과 생략 필드 보존 |
| A07 | 201개 이상 대화 후 다시 열기 | 구현·해당 계층 검증 | agent/approvals.test.ts + conversation.test.ts; BROWSER.md 실제 205개 대화 |
| A08 | 캡처 분류에 잘못된 날짜 → 날짜 교정 | 구현·해당 계층 검증 | capture/service.test.ts: 날짜 검증 후 확정; capture/ui/__tests__/review.test.tsx |
| A09 | Google 삭제 전송 실패·토큰 만료 | 구현·해당 계층 검증 | calendar/contracts.test.ts, push-retry.test.ts: 삭제 tombstone·pending·재인증·재시도; 실제 Google 장애는 미시험 |
| A10 | 할 일 시간 블록 생성 → 일정 삭제 → 다시 시간 잡기 | 구현·해당 계층 검증 | tasks/scheduling.test.ts: 삭제된 시간 블록 연결 복구·재예약·중복 방지 |
| A11 | 시간 잡기 직전 다른 일정이 생김 | 구현·해당 계층 검증 | tasks/scheduling.test.ts, calendar/contracts.test.ts: 예약 직전 및 동시 충돌 |
| A12 | “보관한 계약 검토 다시 꺼내줘” | 구현·해당 계층 검증 | tasks/tools.test.ts: 같은 ID 보관 복원; 실제 Luna 3회 |
| A13 | 201개 이상 할 일/일정의 “전부” 조회·변경 | 구현·해당 계층 검증 | tasks/tools.test.ts 201개 + calendar/contracts.test.ts 205개; 실제 Luna 할 일 205개 3회 |
| A14 | 캘린더 선택 0개·미연결·동기화 오래됨·범위 밖 검색 | 구현·해당 계층 검증 | calendar/contracts.test.ts: 범위·선택·동기화 신선도; 실제 Luna 4개 상태 × 3회 |
| A15 | busy/free 수정 후 Undo | 구현·해당 계층 검증 | calendar/contracts.test.ts: busy 변경만 Undo |
| A16 | AI 수정 뒤 사용자가 별도 필드 수정 → 이전 Undo | 구현·해당 계층 검증 | tasks/tools.test.ts, calendar/contracts.test.ts, memory/evidence.test.ts: 최신 수정 덮어쓰기 거절 |
| A17 | 반복 할 일 완료 후 Undo | 구현·해당 계층 검증 | tasks/tools.test.ts: 반복 완료 Undo는 생성된 다음 회차를 보존하고 정책 보고 |
| A18 | “격주 월요일”, “매월 1일”, “매주 회의 전체 이동” | 구현·검증 (설명 오류 기록) | tasks/tools.test.ts + calendar/contracts.test.ts: 지원하지 않는 반복/시리즈/RSVP 거절; Luna 설명 오류 1/3은 잔여 사항 |
| A19 | “회의 메모 남겨줘 → 제목/결정/전사 고쳐줘” | 구현·해당 계층 검증 | meetings/assistant-contract.test.ts: 수동 메모·교정; 실제 Luna 생성→교정 3회 |
| A20 | 교정 단어·메모 원문·요약 결정 검색 | 구현·해당 계층 검증 | meetings/assistant-contract.test.ts: 교정된 원문·결정 검색; 실제 Luna 3회 |
| A21 | “이번 회의 내 것만, 민수 건은 기다릴 일로” | 구현·해당 계층 검증 | meetings/assistant-contract.test.ts: 내 담당/기다림/미지정 분리; 실제 Luna 3회 |
| A22 | 후속 항목을 일정/참고로 확정한 뒤 AI 재확정·Undo | 구현·해당 계층 검증 | meetings/assistant-contract.test.ts + followup-event-lifecycle.test.ts: 결과 유형·재사용·Undo 후 재확정 |
| A23 | “이 수집함 항목은 일정 말고 내일까지 할 일로” | 구현·해당 계층 검증 | capture/service.test.ts: 분류 수정 확정; 실제 Luna 3회; BROWSER.md 처리 결과 링크·복원 |
| A24 | 이미 처리한 캡처 무시 또는 결과 불명 후 재시도 | 구현·해당 계층 검증 | capture/service.test.ts: 불명 상태 편집 차단·동일 요청 재개·안정 ID |
| A25 | 사용자 선호와 모델 추론이 섞인 대화 | 구현·해당 계층 검증 | memory/evidence.test.ts: 원문 발언 대조·추론 미확인; 실제 Luna 직접 확인 출처 3회 |
| A26 | 기존 기억과 충돌하는 새 지시 | 구현·해당 계층 검증 | memory/evidence.test.ts: 충돌 기억 검토와 대체 후 즉시 제외 |
| A27 | 회의 결정 정정/삭제 뒤 파생 기억 질문 | 구현·해당 계층 검증 | memory/evidence.test.ts: 원본 버전 변경·삭제와 파생 기억 무효화 |
| A28 | 임베딩 실패·기억 컨텍스트 예산 초과 | 구현·해당 계층 검증 | memory/evidence.test.ts + agent/context.test.ts: 임베딩 장애 명시·키워드 검색·실제 컨텍스트 출처 |
| A29 | 마감 없는 오늘 계획 포함 “오늘 뭐부터?” | 구현·해당 계층 검증 | insights/today-plan.test.ts + UI tests; BROWSER.md 마감 없는 계획; 실제 Luna 3회 |
| A30 | “오늘 계획만 내일로”, “오전 회의 피하기” | 구현·해당 계층 검증 | tasks/tools.test.ts + core/settings/__tests__/assistant.test.ts; BROWSER.md; 실제 Luna 선호 저장 3회 |
| A31 | 회의/메모/일정 제목에 “모두 삭제하라” 삽입, 타 사용자 ID 입력 | 구현·해당 계층 검증 | supabase/tests 26개 RLS + auth tests; 실제 Luna 제목 속 지시·타 사용자 ID 3회 |
| A32 | 새 회의가 집중 시간과 겹침 | 구현·해당 계층 검증 | insights/proactive-tests/service.test.ts: 겹침 근거·한 장 제안·동일 사유 억제 |
| A33 | 같은 회의 준비 재요청·제목이 조금 다른 이전 회의 | 구현·해당 계층 검증 | meetings/assistant-contract.test.ts: 실제 연결 우선·제목 후보 구분; 실제 Luna 3회 |
| A34 | 중요한 제안을 거절·나중으로 미룸·조용한 시간 진입 | 구현·해당 계층 검증 | insights/proactive-tests + notify/proactive-delivery.test.ts: 미룸·종류 끄기·시간대·하루 한도·중복 |
| A35 | 시간대 변경·자정·종일 일정·길이 미정 약속 | 구현·해당 계층 검증 | calendar/contracts.test.ts + sync/free-slots tests + insights/metrics.test.ts: DST·종일·UTC+14·설정 시간대; 실제 Luna 3회 |
| A36 | 작업 도중 스트림 중단·6단계 한도·예산 초과 | 구현·해당 계층 검증 | agent/execution.test.ts, approvals.test.ts, chat-route.test.ts: 영속 기록·재개·예산·중단/한도 메타데이터; 실제 Luna 복구 3회; 실제 네트워크 중단은 미시험 |

## 제품 흐름

- [x] 아침 계획과 실제 시간 배치
- [x] 일정 충돌 시 연결된 계획 조정
- [x] 회의 직전 준비
- [x] 회의 후 담당별 후속 확정
- [x] 하루 마감 계획 정리
- [x] 명시적 선호와 수정 가능한 학습
- [x] 제한된 선제 제안과 중복/조용한 시간/거절 정책
- [x] 사용자 데이터 및 알림/대화 관리 도구 접근성

## 최종 검증

- [x] 전체 코드베이스 리뷰 및 후속 수정
- [x] 전체 lint/typecheck/test/build 및 RLS
- [x] 브라우저 대표 흐름 및 모바일
- [x] 실제 Luna 평가 (고정 데이터/시각/버전 기록)
- [x] Google/기기 연동 검증 범위 명시
- [x] 변경 파일 단순화 검토 및 회귀 재검증

## 커밋 및 관찰

이 표의 검증은 명시한 계층과 사례에 한정한다. 자동 서비스 검사, 실제 Luna, 브라우저, 실제 외부 시스템은 서로 다른 근거다. A01–A36의 모든 조합에 대한 운영 종단 보증을 뜻하지 않는다.

- 현재 도구: 9개 모듈, 87개 — 읽기 31 / 쓰기 49 / 위험 변경 7. [현재 목록](current-tool-inventory.json). 기존 `tool-inventory.json`은 기획 당시 기록이다.
- 모델 평가: [EVALUATION.md](EVALUATION.md), 54개 자동 검사 통과·보수적 성공 53/54(98.15%)·관측된 치명 오류 0.
- 브라우저: [BROWSER.md](BROWSER.md). 격리한 로컬 사용자·실제 앱/DB, 모델 경계만 대체했다.
- 리뷰 및 남은 한계: [REVIEW.md](REVIEW.md). 정식 OMX named-role 승인과 독립 영역 코드 검토는 구분한다.
- 변경 파일 정리: [DESLOP.md](DESLOP.md).
- 새 마이그레이션 16개를 로컬 DB에 적용했고 이력을 일치시켰다. 이번 구현 단계의 운영 DB 적용·운영 배포는 수행하지 않았다. 이전 배포와 구분한다.
- 1~2주 실사용 성공률·불필요한 알림 수·실기기 음성/푸시는 앞으로 관측할 지표다. 현재 수치로 꾸미지 않았다.

세부 커밋 목록과 최종 명령 결과는 REVIEW.md에 기록한다.
