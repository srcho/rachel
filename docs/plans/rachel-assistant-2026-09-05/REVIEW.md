# 전체 코드베이스 검토 및 구현 결과

범위: 기준 `dd3782d` 이후 P0–P3 구현과 기존 `src`, 업무 마이그레이션, API·인증·작업 실행 경로. 직접 작성하지 않은 영역을 각 검토자가 교차 검토했고 root가 결과를 통합했다. 생성 타입과 외부 라이브러리는 변경된 계약·호출 경계를 확인했다. 모든 코드 줄의 무결성이나 모든 운영 조합을 보증하지 않는다.

## 검토 결과

발견된 아래 결함은 수정 및 회귀 검증했다. 기능 영역별 구현과 잔여 한계는 [구현 원장](IMPLEMENTATION.md)에 연결되어 있다.

| 심각도 | 발견 사항과 영향 | 반영한 수정 및 근거 |
|---|---|---|
| 높음 | 정상 JWT만 있으면 앱 허용 계정 정책을 우회하여 API/작업의 AI 비용을 발생시킬 수 있음 | `core/auth/policy.ts`, session/proxy/cron 공통 검사. 실제 계정 조회 후 작업 컨텍스트 생성. auth 6개 파일 검사 |
| 높음 | 전사 행의 user_id만 확인하면 타 사용자 회의의 부모 ID를 넣을 수 있음 | 부모 소유자 제약 트리거 및 transcript-owner pgTAP. 전체 RLS 26개 |
| 높음 | Google OAuth 돌아갈 주소의 역슬래시 정규화로 외부 호스트 이동 가능 | parsed origin 검증·제어문자/역슬래시 차단. 상태 쿠키 JSON으로 쿼리 콜론 보존 |
| 높음 | 전사 실패 전 기존 결과 삭제, 생성 중 원본 교정 뒤 오래된 요약 저장 | 원자적 전사 교체 RPC, 생성 시작 버전 CAS, 원문·직전 유효 결과 보존. diarize/assistant-contract 회귀 |
| 높음 | Undo가 재사용 자원을 지우거나 사용자의 최신 수정 덮어씀 | 실제 신규 생성만 Undo, 변경 필드만 복원, 버전 검사, Undo 토큰 원자적 1회 소비 |
| 높음 | 불명 생성 재시도 때 중복·사용자가 삭제한 자원의 부활 가능 | 안정된 생성 키와 실행 기록·생성/삭제 추적. 확실히 검증 가능한 생성만 안전 재개 |
| 높음 | 현재 대화 삭제 승인이 승인 메시지 저장만으로 무효화됨 | 삭제 대상의 제목/생성 정체성 검사와 최종 CAS. 삭제 후 메시지 재저장 생략, 클라이언트 캐시 제거 |
| 중간 | 새 대화가 이전 대화의 로딩 데이터를 잠깐 받아 캐시에 복사 | DockBody 로딩 결과를 threadId와 함께 묶고 일치할 때만 Chat 마운트. 브라우저 회귀 |
| 중간 | 모델 API의 엄격한 선택 입력 처리로 요청하지 않은 검색 필터가 채워짐 | SDK strict:false와 Zod 검증, 요청한 필드만 사용하도록 지침. 보관 복원 실제 Luna 재시험 |
| 중간 | 오전 회의 회피를 기억에만 저장하고 실제 일정 규칙을 바꿨다고 보고 | 운영 선호 전용 도구와 검증된 사용자 발언, 기억 결과는 운영 설정 변경 아님을 명시. 실제 Luna 3회 |
| 중간 | 단계 한도까지 도구를 호출한 뒤 최종 답변이 비거나 한도 표시 누락 | 마지막 단계를 결과 보고에 예약, 6단계 메타데이터와 예산/중단 결과 기록. chat-route 회귀 |
| 중간 | Google Tasks 오래된 잡이 최신 카드/삭제를 덮고, 일부 실패에도 pull cursor 진행 | 실행 전 현재 버전 대조, 중요한 이벤트 실패 전파, 안정 생성 키와 200개 이후 backfill |
| 중간 | Google 전체 동기화가 원격에서 사라진 일정을 미러에 남김 | 전체 페이지 성공 후에만 owner/calendar/window/version/synced 조건으로 정리 |
| 중간 | 남은 실행 시간이 부족한 잡 시작과 중복 key retry가 최신 대기 작업을 잃음 | 실행 전 시간 확보, 미실행 attempt 환급, CAS deferral 및 pending replacement 보존 |
| 중간 | 동시에 바꾼 알림 설정이 pre-read한 중첩 설정에 덮임 | 최신 상태 CAS 안에서 제출한 알림/reminder 필드만 병합. 강제 동시 읽기 회귀 |
| 중간 | 통계 조회 실패가 0으로 바뀌어 거짓 주간 리뷰 저장, 시간대는 Seoul 고정 | 모든 지표 오류 전파, 생성/저장 중단, 7개 집계 뷰를 profile timezone 사용. 날짜 경계 회귀 |
| 중간 | SDK 출력 토큰 총합에 reasoning을 다시 더해 비용 추정 중복 | text/reasoning을 겹치지 않게 저장. 신규 meta tokenAccounting=disjoint-v2. 과거 원장 임의 수정 안 함 |
| 중간 | 회의 후속 결과가 생성한 할 일/일정을 회의 ID로 링크 | 서비스가 반환한 유형별 링크 사용, 자원 경로 검증. result-links 회귀 |
| 중간 | 변경된 근거 제안에서 이미 보관된 기억을 찾기 어려움 | 해당 ID를 직접 여는 기억 URL로 연결. proactive 회귀 |
| 중간 | 내보내기에 확정 후속 항목 매핑 누락 | meeting_followups 포함; 소유자/분류/담당/날짜/결과 연결 내보내기 검사 |

## 교차 검토 범위

- calendar_impl: 원 작성 영역 외 회의·기억·수집함 전체 서비스/도구/화면/출처·인덱스·Undo 및 후속 확정 검토, 마지막 승인 기획→산출물 매핑 감사.
- memory_impl: core 인증/DB/이벤트/잡/사용량/오프라인 경계와 할 일·캘린더 서비스·동기화·예약·마이그레이션 검토.
- meetings_impl: 자신이 작성한 실행 기록을 제외한 에이전트/설정/알림/통계/시스템/API·접근 경계 검토. A36 라우트 검증 추가.
- tasks_impl: 자신이 작성한 할 일을 제외한 승인·실행 기록·신뢰 메시지·대화 삭제 경로 검토 및 실제 브라우저 검증.
- root: 검토 결과 통합, 사용자 흐름·링크·컨텍스트 출처·승인 UI·도구 결과 표시, 남은 API 경계 확인 및 회귀 재실행.

OMX 형식상 리뷰 상태는 **independent review unavailable**이다. 설치된 `code-review` 스킬은 별도의 native `code-reviewer`와 `architect` 두 역할 출력을 요구하지만 이 세션 도구는 해당 agent_type을 노출하지 않는다. 스킬 원문은 [code-review/SKILL.md](/Users/vincent/.codex/skills/code-review/SKILL.md)의 “If either lane cannot be launched or does not return evidence, report `independent review unavailable`”이다. 이 제한은 해당 역할 명칭으로 공식 승인을 내리는 데 적용된다. 위 작업자들의 독립 영역 검토를 그 역할의 공식 승인으로 바꾸어 부르지 않는다. 따라서 이 보고서는 정식 merge-ready/architect APPROVED 판정을 하지 않는다. 사용자 요청의 코드베이스 검토·결함 수정과 이 도구 역할 제한을 구분한다.

## 남은 한계와 후속 관측

- 실제 Luna 54개 대표 사례의 보수적 성공률은 53/54(98.15%). A18 한 답변이 완료 후 간격 반복을 누락하고 매주만 지원한다고 설명했다. 요청하지 않은 반복을 생성하지는 않았다. 세부 실패·기술 상태 문자열 노출·타 언어 단어 혼입은 EVALUATION.md에 남겼다.
- Google/기기 푸시/실제 마이크 종단 검증은 수행하지 않았다. Google 테스트는 장애·상태 전이를 대체 응답으로 검증했다. 서비스 검사를 실연동 성공으로 표시하지 않는다.
- 이미 동시에 출발한 Google Tasks 요청을 외부까지 직렬화하는 lease는 없다. 잡 시간 제한은 Promise.race이며 진행 중 외부 요청을 취소하지 않는다. 오래된 대기 작업의 시작은 막지만 외부 exactly-once를 주장하지 않는다.
- 예산은 요청 전과 단계 사이에 검사한다. 이미 진행 중인 한 호출이나 동시 요청만큼 초과할 수 있으며 전역 금액 예약 시스템은 없다. 현재 구현은 손실 없는 결과 보고와 다음 단계 중단이다.
- 기존 usage 원장은 당시 추정치를 유지한다. 새 토큰 계산은 disjoint-v2로 식별된다. 과거 과대 추정 가능성과 공급자 실제 청구는 별개다.
- 월별/격주 반복, Google 반복 시리즈 편집, 참석자 초대/RSVP는 승인 기획에서 명시적으로 미룬 기능이다. 기기 권한/OAuth 동의는 사용자 조작을 유지한다.
- 1~2주 실사용 지표와 개인 기기 검증은 향후 관측이다. 이번 구현은 로컬 DB 적용·커밋·검토 범위이고, 운영 DB/앱은 이번 단계에서 배포하지 않았다.

## 검증 명령

최종 통합 결과는 아래에 기록한다. 상세 모델/브라우저 근거는 별도 문서와 원본 결과에 있다.

- `pnpm test --maxWorkers=4`: 70개 파일 통과·4개 파일 건너뜀, 290개 검사 통과·60개 건너뜀. 건너뛴 유료/옵션 모델 검사는 통과 수에 넣지 않았다. 별도 명시 실행한 Luna 54개 결과는 EVALUATION.md 기준이다.
- `pnpm typecheck`: 통과. 마지막 통합 빌드에서도 TypeScript 검사.
- `pnpm lint`: 오류 0, 기존 경고 26개·정보 4개. 1MiB를 넘는 원본 평가 JSON 세 개는 크기 안내이며 코드 검사 제외를 넓히지 않았다.
- `pnpm build`: 최종 Next 빌드·타입 검사·19개 경로 생성·Serwist 생성 통과.
- 브라우저 최종: 데스크톱/모바일 12개 통과, 1.1분, 재시도 0. 현재 대화 삭제 후 새 대화까지 검증.
- `pnpm test:rls`: 3개 파일, 26개 모두 통과.
- 로컬 신규 마이그레이션 16개 적용 후 이력 repair 완료. 데이터 초기화 없음.
- 실제 Luna: 자동 54/54, 의미 검토 53/54, 관측 치명 오류 0. 원본 실패 실행도 보존.

## 의미 단위 커밋

```text
181982b docs: record assistant evolution scope and acceptance ledger
03758a3 feat(db): persist approvals and versioned assistant evidence
ad608aa feat(meetings): preserve source notes and expose corrected follow-up workflows
27c9d7d feat(capture): make classification editable and resolution recoverable
9a5d25a feat(memory): verify evidence and invalidate corrected sources
f86ce2e feat(tasks): unify planning scheduling restoration and guarded undo
ade2e73 feat(calendar): expose sync recovery and timezone-safe scheduling contracts
c7e0640 feat(assistant): persist explicit preferences and adaptive persona rules
ba7c17f feat(system): expose data operations and honor user timezone in background jobs
313f6f3 feat(assistant): bind approvals and recover durable conversation actions
4ed6d29 feat(today): connect daily priorities capacity and deadline-safe replanning
1933388 fix(capture): guard source revisions and cancel pending voice sessions
53d2f80 fix(memory): preserve provenance and expose complete review pagination
de0a9a8 fix(meetings): protect corrected content and reusable follow-up lifecycles
009a9f7 fix(sync): reject stale writes and preserve retryable background work
05174c9 fix(access): enforce account policy across requests and jobs
59f5c30 feat(proactive): respect explicit preferences and limit helpful reminders
f28b308 fix(assistant): finish current-thread deletion and report bounded execution
```

후속 검증 산출물/문서 커밋은 이 코드 변경 뒤 별도로 남긴다.
