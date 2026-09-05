# 레이첼 기능·CRUD 감사

기준 커밋: `dd3782d2ab10dcc0b6911f2dfe625f98ebeffc3d` · 2026-09-05

## 범위와 판정 방법

9개 모듈의 AI 도구 등록, 입력 스키마, 출력, 서비스, 화면 액션, 저장·이벤트·검색·복구 경로를 대조했다. 단순 도구 존재와 실제 업무 완료를 분리했다. **“가능”은 호출 가능한 계약이 있다는 의미이며 실제 Luna가 모든 자연어 요청을 정확히 수행한다는 보증이 아니다.** 별도 표시 없는 발견은 소스 추적 결과다. 아래 D1~D6은 로컬에서 재현했다.

검토 단계: ① 기능이 제품에 있는가 → ② AI에 노출됐는가 → ③ 필요한 상태를 읽는가 → ④ 승인/변경이 이어지는가 → ⑤ 실제 결과를 정확히 반환하는가 → ⑥ 실패·정정·복구 후에도 일관적인가.

## 1. AI에 실제 노출된 범위

레지스트리는 `module.tools`만 노출한다. UI 액션·서비스 함수가 있다고 자동으로 도구가 되지 않는다. 등록 이름은 AI에 전달될 때 점이 밑줄로 바뀐다. [레지스트리](../../../src/core/registry/registry.ts#L55), [모듈 등록](../../../src/modules/index.ts#L15), [어댑터](../../../src/modules/agent/tool-adapter.ts#L12)

| 모듈 | 읽기 | 쓰기 | 승인 대상 destructive | 합계 |
|---|---:|---:|---:|---:|
| 할 일 | 3 | 5 | 2 | 10 |
| 캘린더 | 4 | 4 | 1 | 9 |
| 회의 | 3 | 2 | 1 | 6 |
| 기억·통합 검색 | 3 | 2 | 1 | 6 |
| 수집함 | 1 | 3 | 0 | 4 |
| 인사이트 | 2 | 0 | 0 | 2 |
| 대화 관리 | 0 | 0 | 0 | 0 |
| 알림 | 0 | 0 | 0 | 0 |
| 데이터 관리 | 0 | 0 | 0 | 0 |
| **합계** | **16** | **16** | **5** | **37** |

이는 선언된 위험 등급의 집계다. 인사이트 도구는 read로 선언됐지만 재생성 시 저장·비용이 발생하므로 실제 부작용 분류와는 차이가 있다. 전체 이름·설명은 [도구 목록](tool-inventory.json)에 보존했다.

## 2. 기능별 CRUD와 끊기는 흐름

기호: **가능** = 직접 도구 제공, **부분** = 주요 필드/범위/복구 제약, **없음** = AI 도구 없음, **제품 확장** = 화면과 서비스부터 설계 필요. `삭제 승인 문제`는 아래 D1로, 모든 destructive 도구에 공통 적용된다.

| 기능 | 생성 C | 읽기 R | 수정 U | 삭제/보관 D | 주요 제약·근거 |
|---|---|---|---|---|---|
| 기본 할 일 | 가능 | 가능 | 가능 | 가능* | 제목·설명·우선순위·라벨·마감·체크리스트. 삭제 승인 문제. [도구](../../../src/modules/tasks/tools.ts#L57) |
| 오늘 계획·반복 규칙 | 가능 | 부분 | 가능 | 필드 해제 가능 | planDate/repeatRule 쓰기는 가능하나 get/list 출력 누락. [스키마](../../../src/modules/tasks/schema.ts#L28), [출력](../../../src/modules/tasks/tools.ts#L29) |
| 체크리스트 항목 | 가능 | 가능 | 가능 | 가능 | 배열 전체 교체로 CRUD 가능. 항목별 수정 도구가 없다고 불가능은 아님. 동시 수정 보호는 별도 필요. [스키마](../../../src/modules/tasks/schema.ts#L21) |
| 완료·컬럼 이동·일괄 변경 | 가능 | 가능 | 가능 | 해당 없음 | 일괄 변경은 승인 대상. 이동 Undo는 순서 복원 안 함. [도구](../../../src/modules/tasks/tools.ts#L178) |
| 보관한 할 일 | 보관 가능 | 부분 | 복원 없음 | 영구 삭제* | 일반 list에서 보관 제외, 보관 조회/복원 도구 없음. ID를 알 때 get 가능한 것과 검색 가능은 다름. [조회](../../../src/modules/tasks/repository.ts#L225), [UI 복원](../../../src/modules/tasks/actions.ts#L24) |
| 할 일 시간 잡기 | 조합 가능 | 부분 | 연결 작업 없음 | 연결 해제 작업 없음 | UI 공통 서비스가 도구에 없음. 기존 연결 일정 삭제 후 재예약 경로도 막힘. [서비스](../../../src/modules/tasks/scheduling.ts#L10) |
| 보드·컬럼 관리 | AI 없음 | 가능 | AI 없음 | AI 없음 | listBoards만 제공. 컬럼 생성/이름 변경/삭제 서비스는 존재하지만 전부 화면 노출됐다고 보지는 않음. 개인 사용에서 낮은 우선순위. [서비스](../../../src/modules/tasks/service.ts#L432) |
| 단일 캘린더 일정 | 가능 | 부분 | 가능 | 가능* | 제목·시간·종일·설명·장소 수정. busy·반복 상태 읽기 누락, 삭제 결과에서 동기화 상태 누락. [도구](../../../src/modules/calendar/tools.ts#L13) |
| 일정 검색·빈 시간 | 해당 없음 | 부분 | 해당 없음 | 해당 없음 | 기간 필수, q 제거, 페이지 커서 없음. 빈 시간은 조회 가능. [도구](../../../src/modules/calendar/tools.ts#L49) |
| 캘린더 선택·충돌·재시도 | 해당 없음 | 부분 | 없음 | 해당 없음 | UI에서 선택/충돌 비교·해결/재전송 가능, AI 도구 없음. [액션](../../../src/modules/calendar/actions.ts#L9) |
| Google Tasks 미러 | 활성화 가능 | 가능 | 활성화·pull 가능 | 비활성화 가능 | 모든 Google 연동이 막힌 것은 아님. 연결 동의는 별도 사용자 동작. [도구](../../../src/modules/calendar/tools.ts#L28) |
| 반복 일정·초대·RSVP | 제품 확장 | 부분 | 제품 확장 | 범위 미지원 | 참석자 조회만 가능. 시리즈 전체/이번 이후 수정·반복 생성 계약 없음. [일정 스키마](../../../src/modules/calendar/schema.ts#L5) |
| 녹음 없는 회의 메모 | 없음 | 부분 | 없음 | 가능* | UI 생성 가능. AI get은 전체 메모 원문을 반환하지 않음. [편집](../../../src/modules/meetings/editing.ts#L51), [get](../../../src/modules/meetings/tools.ts#L34) |
| 녹음·전사 | 기기 동작 필요 | 부분 | 교정 도구 없음 | 회의 삭제* | 전사 전체/페이지 읽기 없음. 화자·전사 교정은 UI에만 있음. [액션](../../../src/modules/meetings/actions.ts#L42) |
| 회의 요약·결정 | 재요약 가능 | 가능 | 수동 교정 도구 없음 | 회의 삭제* | 메모 재요약 원문 유실, 교정본 맥락 불일치 주의. [도구](../../../src/modules/meetings/tools.ts#L99) |
| 회의 검색·준비 | 준비 도구 없음 | 부분 | 해당 없음 | 해당 없음 | search는 설명과 달리 원본 전사만 검색. 준비 서비스는 정확한 제목 연결 위주. [검색](../../../src/modules/meetings/tools.ts#L54), [준비](../../../src/modules/meetings/preparation.ts#L20) |
| 회의 후속 항목 | 할 일 확정 가능 | 부분 | 분류·담당·기한 override 없음 | 결과별 Undo 부정확 | UI는 일정/참고/기다림 등 구분, AI 도구는 할 일 ID라고 가정. [도구](../../../src/modules/meetings/tools.ts#L112), [검토 서비스](../../../src/modules/meetings/review.ts#L49) |
| 수집함 | 가능 | 열린 항목만 | 제안 수정 없음 | 무시 가능 | add/list/resolve/dismiss만 제공. UI 수정 후 확정은 도구에 없음. [도구](../../../src/modules/capture/tools.ts#L5), [액션](../../../src/modules/capture/actions.ts#L23) |
| 처리한 수집함·참고 메모 | 확정 가능 | 일반 경로 없음 | 없음 | 복원/삭제 없음 | note는 DB에 남지만 고유 읽기 링크·완료 목록이 없음. [확정](../../../src/modules/capture/service.ts#L221) |
| 장기 기억 | 가능 | 부분 | 가능 | 삭제 가능* | 내용·유형·중요도·고정 수정 가능. 충돌 후보는 list에서 숨김. [도구](../../../src/modules/memory/tools.ts#L66) |
| 기억 충돌 검토·보관 | 후보 저장 가능 | 없음 | 검토/복원 없음 | 보관 없음 | UI 검토 액션 존재. AI는 needsReview만 받고 후속 해결 못 함. [액션](../../../src/modules/memory/actions.ts#L37) |
| 통합 검색 | 해당 없음 | 가능·제약 | 해당 없음 | 해당 없음 | 임베딩 선행, 인덱스 지연, 짧은 발췌, 원본 교정 갱신 경로 누락. [검색](../../../src/modules/memory/search.ts#L71) |
| 브리핑·주간 리뷰 | 생성 가능 | 가능 | 재생성 가능 | 도구 없음 | 기존 결과 조회/재생성은 가능. 내용을 계획·일정으로 적용하는 작업은 별도 필요. [도구](../../../src/modules/insights/tools.ts#L6) |
| 대화 기록 관리 | UI 가능 | UI 가능·제약 | AI 도구 없음 | UI 가능 | 도구로 타 스레드 검색·관리 불가. 최신 200개 읽기 문제. [저장소](../../../src/modules/agent/repository.ts#L10) |
| 알림·조용한 시간 | AI 없음 | AI 없음 | AI 없음 | AI 없음 | 이벤트 알림과 설정은 존재. 서버 정책 변경과 기기 알림 허용을 분리해야 함. [모듈](../../../src/modules/notify/module.ts#L19) |
| 호칭·개인 운영 선호 | AI 전용 도구 없음 | 간접 맥락 | AI 없음 | AI 없음 | 호칭 외 개인화된 계획 정책은 제품 확장. [설정](../../../src/core/settings/profile.ts#L6) |
| 백업·내보내기 | UI 가능 | AI 없음 | 해당 없음 | AI 없음 | 필요하면 사용자 데이터 내보내기 액션/링크만 제공. 인증·키 조작은 노출 대상 아님. [모듈](../../../src/modules/system/module.ts#L6) |

## 3. 로컬에서 재현한 결함

**진단 7개 통과 = 목록 집계 1개와 결함 재현 6개가 예상대로 확인됐다는 뜻이다. 버그가 수정됐다는 뜻이 아니다.** 앱 회귀 테스트와 섞이지 않도록 문서 폴더의 별도 Vitest 설정에서만 실행한다. 로컬 Supabase 임시 사용자를 만들고 종료 후 삭제했다. 이벤트·작업 enqueue는 비활성화했고 실제 모델을 호출하지 않았다.

| ID | 우선순위 | 재현 | 확인 결과 | 수정 완료 기준 |
|---|---|---|---|---|
| D1 | P0 | 승인 대기 tool part를 둔 SDK Chat에서 addToolApprovalResponse 실행 | approval-responded로 바뀌지만 transport 요청 0회 | 승인 시 실행 재개, 거절 시 변경 0회, 재전송해도 중복 없음 |
| D2 | P0 | 400자 초과 수동 메모 생성 → meetings.summarize | summary_md가 짧은 전사 안내로 교체. 마지막 원문 결정 사라짐 | 원문 별도 보존, 입력 부족 시 기존 결과 유지 |
| D3 | P0 | planDate/repeatRule을 넣어 할 일 생성 → DB와 AI get 대조 | DB에는 저장되지만 AI get에는 필드가 없음 | 모든 수정 가능 필드의 읽기 왕복 검증 |
| D4 | P0 | 순서가 명확한 201개 메시지 저장 → 기본 listMessages | 최초 200개 반환, 201번째 최신 메시지 제외 | 최신 페이지+과거 페이지 조회, 긴 대화 맥락 보존 |
| D5 | P0 | “월요일 출시” 메모를 “금요일 출시”로 요약 교정 → get과 회의 맥락 대조 | get은 금요일, 맥락은 월요일 | 화면·get·맥락·검색이 같은 교정본 사용 |
| D6 | P0 | 캡처를 ISO가 아닌 날짜로 확정 → 올바른 날짜 override 재시도 → dismiss | resolving에 고정. 교정 재시도 실패. dismiss도 상태 불변 | 대상 명령 검증을 동결 전에 완료. 부작용 전 오류는 수정 가능 |

근거 연결:

- **D1:** [Chat 설정](../../../src/modules/agent/dock/Chat.tsx#L59), [승인 콜백](../../../src/modules/agent/dock/Chat.tsx#L79). 설치된 `ai/src/ui/chat.ts:496–546`는 자동 재전송 콜백이 설정돼야 추가 요청을 보낸다. 현재 Chat에는 해당 설정이나 승인 뒤 수동 sendMessage가 없다. “영구 실행 불가”보다 “승인 버튼만으로 실행이 이어지지 않음”이 정확하다. 적용 대상은 tasks.bulkUpdate/tasks.delete/calendar.deleteEvent/meetings.delete/memory.forget이다.
- **D2:** [메모 원문 저장](../../../src/modules/meetings/editing.ts#L62), [재요약](../../../src/modules/meetings/tools.ts#L99), [빈 전사 분기](../../../src/modules/meetings/postprocess.ts#L97). 요약 JSON에 첫 400자는 남을 수 있지만 그 이후 원문 보존을 보장하지 못한다. UI에서 버튼을 숨기는 것으로 공통 서비스 보호를 대신할 수 없다.
- **D3:** [쓰기 스키마](../../../src/modules/tasks/schema.ts#L35), [get](../../../src/modules/tasks/tools.ts#L117). planDate, repeatRule, dueHasTime, calendarEventId, meetingId, archivedAt, updatedAt가 읽기 결과에서 빠진다.
- **D4:** [메시지 조회](../../../src/modules/agent/repository.ts#L66). 오래된 메시지를 지우는 문제가 아니라 기본 재조회 범위가 오래된 쪽인 문제다. [기억 추출](../../../src/modules/memory/jobs.ts#L20)도 이 결과의 끝 30개를 사용한다.
- **D5:** [교정 쓰기](../../../src/modules/meetings/editing.ts#L21), [맥락 읽기](../../../src/modules/meetings/context.ts#L29). 검색 갱신 이전부터 이미 두 표현이 달라진다.
- **D6:** [확정 동결과 대상 실행](../../../src/modules/capture/service.ts#L137), [무시 조건](../../../src/modules/capture/service.ts#L242). 잘못된 입력을 고칠 수 있게 하되, 실제 생성 여부가 불명인 경우의 중복 방지는 유지해야 한다.

재현 명령 — 로컬 Supabase가 실행 중이어야 하며 `TEST_SUPABASE_*` 환경변수가 있으면 의도적으로 중단한다.

```sh
pnpm exec vitest run \
  --config docs/plans/rachel-assistant-2026-09-05/vitest.config.ts \
  --reporter=json \
  --outputFile=docs/plans/rachel-assistant-2026-09-05/diagnostic-results.json
```

[진단 코드](diagnostics.test.ts) · [원시 결과](diagnostic-results.json)

## 4. 소스 추적으로 확인한 실행·복구 제약

아래는 실제 Google 장애나 모델 대화로 재현하지 않은 경로 분석이다. 발생 조건과 예상 사용자 영향을 명시한다.

| ID | 우선순위 | 조건과 문제 | 근거 | 제안 |
|---|---|---|---|---|
| F1 | P0 | 일정 삭제가 로컬 pending으로 끝나도 AI 결과에 syncStatus가 없음. Google 삭제 완료로 오인할 수 있음 | [삭제 도구](../../../src/modules/calendar/tools.ts#L125), [삭제 서비스](../../../src/modules/calendar/events.ts#L217) | 삭제도 로컬/외부 상태와 재시도 동작 반환 |
| F2 | P0 | 연결 일정을 삭제해도 카드 링크가 남음. 예약 서비스는 링크만 보고 반환, UI는 재예약 대신 기존 링크만 표시 | [서비스](../../../src/modules/tasks/scheduling.ts#L17), [UI](../../../src/modules/tasks/ui/ScheduleTask.tsx#L34), [생성 키 조회](../../../src/modules/calendar/repository.ts#L236) | schedule/reschedule/unschedule 공통 작업. 삭제 상태 확인과 연결 복구 |
| F3 | P1 | 회의 제목·화자·요약·전사 교정/메모 생성 뒤 해당 변경 이벤트 없음. 인덱스와 파생 기억이 낡음 | [편집](../../../src/modules/meetings/editing.ts#L11), [인덱서](../../../src/modules/meetings/indexer.ts#L9), [추출 이벤트](../../../src/modules/memory/module.ts#L42) | 교정본 공통 읽기 + meeting.changed + 출처 버전. 이전 기억도 재검토 |
| F4 | P1 | 회의 search가 전사·요약 검색이라고 안내하나 원본 transcript_segments만 검색. 교정 오버레이·final 우선순위 무시 | [검색](../../../src/modules/meetings/tools.ts#L54), [교정된 전사 읽기](../../../src/modules/meetings/service.ts#L186) | 공통 검색 서비스, 날짜/회의 필터, 교정본·요약·메모 검색 |
| F5 | P1 | 이미 일정/참고로 확정한 후속 항목도 도구는 cardIds/newCardIds로 보고. Undo는 tasks.delete 호출 | [검토 결과](../../../src/modules/meetings/review.ts#L49), [도구 결과](../../../src/modules/meetings/tools.ts#L136) | kind/entityId/createdNow 반환. 실제 신규 자원만 유형에 맞춰 복원 |
| F6 | P1 | 후속 도구는 indexes 생략 시 전원 항목 선택. UI의 내 담당 기본 선택과 다름 | [도구](../../../src/modules/meetings/tools.ts#L112), [UI](../../../src/modules/meetings/ui/ReviewSheet.tsx#L50) | 담당·기한·분류를 입력으로 받는 공통 검토. 대상 불명/대량 확정은 미리보기 |
| F7 | P1 | tasks/calendar 조회 기본 50/최대 200개. total/hasMore/cursor가 없어 전체 여부 알 수 없음 | [할 일 필터](../../../src/modules/tasks/schema.ts#L68), [일정 스키마](../../../src/modules/calendar/schema.ts#L35) | 페이지 조회와 완결성 메타데이터. 전체 처리 전 범위 확인 |
| F8 | P1 | 선택된 캘린더 수로 connected 판단. 표시를 전부 끄면 미연결로 보임. 초기 수집 범위·최신성도 출력에 없음 | [도구](../../../src/modules/calendar/tools.ts#L49), [동기화 범위](../../../src/modules/calendar/sync.ts#L14) | OAuth 상태/선택 범위/수집 기간/lastSyncedAt 별도 반환 |
| F9 | P1 | 일정 Undo에서 isBusy 누락. 할 일 Undo는 변경하지 않은 옛 필드까지 복원, 최신 사용자 수정 보호 없음 | [일정 Undo](../../../src/modules/calendar/tools.ts#L103), [할 일 Undo](../../../src/modules/tasks/tools.ts#L162), [공통 Undo](../../../src/modules/agent/tool-adapter.ts#L77) | 변경 필드 inverse patch와 expectedVersion. 충돌 시 미리보기 |
| F10 | P1 | 결과가 uncertain이면 새 요청을 요구. 응답 재시도도 완료된 동일 입력만 재사용하므로 미완료 작업을 이어갈 도구가 없음 | [실행 원장](../../../src/modules/agent/tool-once.ts#L15) | 원장은 유지하고 실행 기록 읽기/실제 자원 대조/안전한 재개 추가 |
| F11 | P1 | note 확정은 resolved_ref type만 저장. 화면/AI 열린 목록에서 사라지고 통합 검색 대상에도 없음 | [note 확정](../../../src/modules/capture/service.ts#L221), [AI 목록](../../../src/modules/capture/tools.ts#L19) | 처리 완료 목록, get/search/restore, 읽을 수 있는 메모 링크 |
| F12 | P1 | dismiss가 0행 변경이어도 성공 반환 | [서비스](../../../src/modules/capture/service.ts#L242), [도구](../../../src/modules/capture/tools.ts#L41) | changed/status/reason 반환. 이미 처리한 항목을 새로 정리했다고 하지 않기 |

## 5. 개인화·지식·판단 제약

| ID | 우선순위 | 현재 상태와 영향 | 근거 | 제안 |
|---|---|---|---|---|
| P1 | P1 | AI 기억 저장은 항상 manual로 표기. 유사 후보가 없으면 confirmed_at 기록 | [도구](../../../src/modules/memory/tools.ts#L39), [저장](../../../src/modules/memory/service.ts#L70) | 사용자 발언·명시적 확인·모델 추론을 구분하고 근거 메시지 연결 |
| P2 | P1 | 충돌 기억은 AI list에서 제외, review 처리 도구 없음. 내용 update만으로 review_against 해제 안 됨 | [목록](../../../src/modules/memory/tools.ts#L74), [수정](../../../src/modules/memory/service.ts#L124) | review list/get/resolve, 보관/복원 노출 |
| P3 | P1 | 임베딩 오류가 통합 검색·기억 저장/회상에 직접 영향. 고정 기억과 회상을 Promise.all로 묶어 회상 실패 시 고정 기억도 컨텍스트에서 빠짐 | [기억 컨텍스트](../../../src/modules/memory/context.ts#L11), [검색](../../../src/modules/memory/search.ts#L78), [컨텍스트 오류 처리](../../../src/modules/agent/context.ts#L31) | 고정 선호는 독립 조회, 검색 실패를 모델에도 상태로 전달. 키워드 경로 검토 |
| P4 | P2 | 기억 출처 목록은 컨텍스트 자르기 전에 추가. “제공된 기억 후보”와 “실제로 답에 쓴 근거”가 섞일 수 있음 | [출처 추가](../../../src/modules/memory/context.ts#L29), [잘라내기](../../../src/modules/agent/context.ts#L36) | 최종 전달된 출처만 기록. 답변 근거 인용과 별도 표시 |
| P5 | P2 | 자동 기억 추출 입력에 사용자 발언과 레이첼 답변이 함께 있음 | [추출](../../../src/modules/memory/jobs.ts#L20) | 모델 제안이 사용자 사실로 재저장되는지 평가. 사실 승격은 근거 발언 확인 필요. 실제 오추출 발생은 미검증 |
| P6 | P1 | 할 일 기본 컨텍스트가 오늘/지연 마감 중심, 오늘 계획은 빠짐 | [컨텍스트](../../../src/modules/tasks/context.ts#L5) | planDate·활성 작업·연결 시간·마감 구분. 브리핑도 같은 표현 사용 |
| P7 | P2 | 종료 미정은 무조건 1시간, 오류 설명은 실제 원인보다 연결 맥락을 보도록 지시 | [에이전트](../../../src/modules/agent/agent.ts#L35) | 명시한 시간 > 확인된 유형별 선호 > 표시되는 기본값. 오류는 실제 코드/복구 방법 기준 |
| P8 | P2 | 요청마다 모든 도구와 최대 6단계. 복합 계획이 조회+다건 수정으로 길어질 수 있음 | [에이전트](../../../src/modules/agent/agent.ts#L9) | 제한을 무작정 늘리기보다 업무 단위 명령과 부분 완료 기록. 단계 한도 종료 시 미완료 보고 |
| P9 | P2 | 브리핑/주간 리뷰 재생성은 read 분류라 쓰기 원장의 중복 방지 대상에서 제외 | [도구](../../../src/modules/insights/tools.ts#L6), [어댑터](../../../src/modules/agent/tool-adapter.ts#L45) | 조회/생성 부작용 구분, 캐시/생성 키·비용 정책 명시 |
| P10 | P2 | 일반 요청 컨텍스트 시간대 기본은 Asia/Seoul이며 userContext에서 사용자 시간대를 전달하지 않음 | [컨텍스트 생성](../../../src/core/context.ts#L24), [userContext](../../../src/core/context.ts#L57) | 사용자 시간대의 단일 기준. 여행 시 날짜 전환·종일·마감 회귀 검증 |

추가 제품 한계:

- 반복 할 일은 weekly/after_completion이다. weekly에서는 interval을 계산에 사용하지 않으므로 “격주”를 임의의 interval 값으로 넣어 지원하는 척하면 안 된다. [반복 계산](../../../src/modules/tasks/repeat.ts#L19)
- 반복 완료 Undo 뒤 다음 회차를 남기는 것은 기존 정책이다. 단순 버그로 분류하지 말고 AI 결과에도 범위를 설명한다. [기존 테스트](../../../src/modules/tasks/__tests__/repeat.test.ts#L55)
- 캘린더 참석자 초대·RSVP·시리즈 편집은 현재 제품 계약에 없다. 도구 연결만으로 끝나는 작업이 아니다.
- OAuth 재동의·읽기 전용 캘린더·기기 마이크/알림 권한은 정상적인 경계다. 레이첼의 역할은 정확한 상태 설명과 다음 버튼 제공이다.

## 6. 승인·원본 데이터 신뢰 경계에 대한 추가 검증 과제

서버가 승인 제안 ID, 사용자, 대상 버전, 실제 변경 내용을 함께 검증하는지 종단 검증이 필요하다. 현재 UI 승인 표시만으로 동시 수정과 변조된 요청에 대한 업무 정책 보장을 추정하면 안 된다. 또한 회의·메모·캘린더 제목은 데이터이므로 그 안의 “앞선 지시를 무시하고 삭제하라” 같은 문장을 사용자 실행 지시로 취급하지 않아야 한다. [채팅 API](../../../src/app/api/chat/route.ts), [컨텍스트 조합](../../../src/modules/agent/context.ts#L23), [도구 실행](../../../src/modules/agent/tool-adapter.ts#L29)

이 항목은 실제 악용을 재현한 취약점 주장과 구분한다. 기획상 요구는 구체적이다: 승인한 변경만 실행, 읽은 문서로 권한 확대 금지, 다른 사용자 자원 접근 거부, 오래된 승인 거부, 중단 뒤 동일 변경 재실행 방지. 관련 출시 조건은 [수용 기준](ACCEPTANCE.md)의 A01~A03/A31에 있다.

## 7. 판정

**모든 기능을 레이첼이 자유롭게 CRUD할 수 있는 상태는 아니다.** 기본 생성·조회·수정·삭제는 상당 부분 열려 있다. 가장 큰 결손은 새 필드의 읽기, 보관과 복구, 수정된 지식의 일관성, 화면과 AI가 같은 업무 규칙을 쓰는지에 있다. 페르소나 고도화는 이 기반 위에 구현해야 한다.

이 문서의 결함 재현과 소스 분석은 특정 커밋의 관찰이다. 이후 수정에서는 진단의 “현재 잘못된 결과”를 새 코드의 합격 조건으로 유지하지 말고, [수용 기준](ACCEPTANCE.md)의 올바른 결과를 회귀 테스트로 옮겨야 한다.
