# Rachel PRD — 개인 비서 에이전트 v1

> 문서 상태: 초안 v1.0 (검토 대기) · 작성일: 2026-09-02 · 사용자: Vincent 1인
>
> 코드베이스: 새로 시작. 이전 프로토타입(Neon + 로컬 Qwen + Mac 프라이빗 런타임)은 참고 자료로만 쓰고, 이 문서가 새 기준이다.
>
> 이 문서는 "무엇을 왜 만드는가"(제품)와 "어떤 구조로 만드는가"(아키텍처)를 함께 정의한다. 구현 세부는 각 Phase 시작 시 `docs/adr/`와 모듈 README로 분리한다.

---

## 0. 한눈에 보기

- 레이첼은 **한 사람을 위한 비서 에이전트**다. 할 일(칸반), 일정(Google Calendar), 회의(녹음·전사·요약), 기억, 인사이트를 하나의 대화와 하나의 작업공간에서 다룬다.
- 모든 기능은 **모듈**이다. 모듈은 스키마·도구·컨텍스트·이벤트·잡·인사이트·UI를 하나의 계약(`RachelModule`)으로 내놓고, 커널이 조립한다. 새 기능은 폴더 하나와 등록 한 줄로 끼워 넣는다.
- 스택: Next.js 16 · Supabase(Postgres + pgvector, Auth, Storage, Realtime, pg_cron) · Drizzle · Vercel AI SDK + OpenAI `gpt-5.6-luna` · shadcn/ui · Vercel Hobby · PWA.
- 비용 목표: **월 $15 이하**(회의 20시간 기준). 인프라는 무료 티어, AI는 luna와 mini 전사 모델 중심, 모든 호출은 비용 원장에 기록한다.
- 요구사항 대비 가장 큰 제안 4가지: ① 준실시간 청크 전사(실시간 대비 1/6 비용) ② 이벤트 원장에서 기억·인사이트 파생 ③ 제안→확인→실행 카드 ④ 모듈 레지스트리.

---

## 1. 제품 정의

### 1.1 한 문장

"내 하루의 데이터를 전부 기억하고, 어디서든 한 번의 대화로 일을 처리해 주는 개인 비서."

### 1.2 사용자와 하루의 흐름

| 시각 | 상황 | 레이첼이 하는 일 |
| --- | --- | --- |
| 07:30 | 폰에서 PWA를 연다 | Today에 오늘 일정, 기한 카드, 어제 회의에서 나온 액션 아이템이 카드 제안으로 놓여 있다 |
| 10:00 | 오프라인 회의 시작 | 버튼 한 번으로 녹음·준실시간 자막·메모가 함께 켜진다 |
| 11:05 | 회의 종료 | 5분 안에 요약·결정·액션아이템이 만들어지고 "액션 3개를 카드로 만들까요?" 확인 카드가 뜬다 |
| 14:00 | 캘린더 화면에서 독을 열고 "목요일 오후에 김OO과 30분 잡아줘" | 빈 슬롯을 제안하고, 확인하면 Google Calendar에 생성한다 |
| 18:00 | "지난주 회의에서 예산 얘기 뭐였지?" | 회의 검색 도구로 해당 전사 구간을 찾아 답하고 출처를 링크한다 |
| 일요일 | Insights를 연다 | 주간 리뷰: 완료 카드, 회의 시간, 밀린 항목, 다음 주 제안 3개 |

### 1.3 성공 기준

| 기준 | 목표 |
| --- | --- |
| 첫 화면(Today) 조작 가능 시점 | 모바일 4G에서 LCP 1.5초, 조작 가능 3초 이내 |
| 대화 한 번으로 끝나는 작업 | 카드 생성·이동, 일정 생성·변경, 회의 검색이 추가 화면 이동 없이 완료 |
| 회의 후처리 | 60분 회의 기준 종료 후 5분 안에 요약·액션아이템 준비 |
| 근거 | 레이첼의 사실 주장에는 출처 링크가 붙는다 |
| 비용 | 월 $15 이하, Settings에서 실시간 확인 |
| 확장성 | 모듈 가이드만 보고 하루 안에 새 모듈(예: 루틴)을 붙일 수 있다 |

### 1.4 설계 원칙

1. **화면은 적게, 모듈은 많이.** 기본 내비게이션은 6개를 넘기지 않는다. 기능은 모듈로 늘린다.
2. **레이첼은 원문을 통째로 읽지 않는다.** 짧고 현재성 높은 정보만 기본 컨텍스트에 넣고, 나머지는 도구로 찾는다.
3. **되돌리기 어려운 일은 제안→확인→실행.** 외부 상태(Google Calendar) 변경, 삭제, 비용이 드는 재처리는 확인 카드를 거친다.
4. **모든 변화는 이벤트로 남는다.** 기억과 인사이트는 이벤트 원장에서 파생된다. 새 지표는 나중에 추가해도 과거 데이터로 계산할 수 있다.
5. **비용은 추정하지 않고 측정한다.** 모든 AI 호출은 토큰·초·비용을 원장에 남긴다.
6. **사용자가 쓴 글은 AI가 덮어쓰지 않는다.** 생성물은 버전으로 쌓인다.
7. **UI 프리미티브는 shadcn/ui만.** 한 화면에 주 행동 하나.

---

## 2. 요구사항 검토와 제안

사용자 요구를 그대로 받아들인 항목과, 더 나은 방법을 제안한 항목을 구분한다. 제안은 모두 이 문서의 나머지 부분에 반영돼 있다.

| # | 요구 | 검토 | 제안 |
| --- | --- | --- | --- |
| 1 | 트렐로 같은 칸반 | 단순 3열 보드는 곧 한계에 닿고, 트렐로 전체 복제는 과하다 | 보드→리스트→카드 모델. 리스트에 `role`(backlog/todo/doing/done)을 둬서 레이첼과 인사이트가 열의 의미를 이해한다. 라벨·기한·체크리스트·연결(회의/일정)까지 포함하고 파워업·자동화 규칙은 제외 |
| 2 | Google Calendar 연결과 CRUD | Google이 원본이고 앱은 캐시다 | syncToken 증분 동기화에 더해, 공개 HTTPS가 생기므로 Google push 채널로 외부 변경을 즉시 반영. UI에서 직접 편집하면 바로 실행하고, 레이첼이 제안한 변경만 확인 카드를 거친다 |
| 3 | 오프라인 회의 실시간 전사·후처리·요약 | 실시간 WebRTC 전사는 $0.017/분, 60분에 $1.02. 회의 값어치의 대부분은 회의 후 정리에 있다 | 기본은 **20초 청크 준실시간 자막**(`gpt-4o-mini-transcribe`, $0.003/분). 종료 후 `gpt-4o-transcribe-diarize`로 정식 화자 전사. 진짜 실시간(WebRTC)은 회의별 옵션. 두 방식은 같은 어댑터 인터페이스 뒤에 있다 |
| 4 | 에이전트가 모든 내용을 기억·CRUD | "모든 데이터를 프롬프트에" 넣으면 느리고 비싸고 중요한 맥락이 희석된다 | 3층 기억(episodic/semantic/procedural) + 통합 검색 인덱스(한국어 친화 하이브리드) + 도구 기반 접근. 야간 정리 잡이 이벤트에서 기억 후보를 뽑고 사용자가 한 번에 확인한다 |
| 5 | 어떤 화면에서도 빠른 채팅(floating) | 독 자체보다 "지금 보고 있는 것"을 아는 게 핵심이다 | 전역 독(단축키 ⌘J) + 화면 맥락 주입(현재 회의·카드·날짜) + 제안 카드 + 음성 입력. 전체 화면 대화와 같은 스레드를 공유한다 |
| 6 | Next.js + Supabase, PWA | 적합 | Supabase 하나로 DB·Auth·Storage·Realtime·스케줄을 해결. Drizzle로 타입 스키마(객체화). PWA는 설치·오프라인 셸·완료 알림까지. 데이터 오프라인 캐시는 v1 제외 |
| 7 | 미니멀·컴팩트·모던, shadcn | 적합 | shadcn/ui만 사용. 이전 프로토타입에서 확정한 프리셋(radix-mira, Noto Sans/Serif, Phosphor)을 유지 |
| 8 | 가장 비용 효율적으로 | 인프라보다 전사 비용이 지배적이다 | 무료 티어 구성 + 전사 전략(#3) + 오디오 보존 정책 + AI 비용 원장과 예산 알림 |
| 9 | 대부분 LLM은 OpenAI luna | luna는 nano급 가격($0.20/1M 입력), 1M 컨텍스트, 함수 호출·구조화 출력·프롬프트 캐시 지원 | 모든 텍스트 역할의 기본 모델. 역할별 라우팅으로 나중에 특정 역할만 상위 모델로 바꿀 수 있다. 캐시 친화적 프롬프트 구조로 입력 비용을 더 낮춘다 |
| 10 | 데이터 축적 → 대시보드 인사이트 | 원본 테이블을 매번 집계하면 느리다 | 일일 롤업 테이블 + 주간 리뷰(luna) + `insights.query` 도구. 새 지표는 `InsightProvider`를 추가하면 과거까지 재계산된다 |
| 11 | 모듈화·객체화 | 폴더 분리만으로는 부족하고 계약이 필요하다 | `RachelModule` 계약과 레지스트리. 커널이 스키마·도구·컨텍스트·잡·인사이트·설정·내비를 모듈에서 파생한다 |

### 이전 프로토타입에서 가져오는 검증된 규칙

- 외부 변경은 구조화된 제안을 먼저 만들고 확인 뒤 실행한다. 같은 확인을 두 번 눌러도 결과는 하나다(idempotency key).
- 레이첼 입력은 최근 대화·관련 기억·현재 카드·오늘 일정으로 제한하고, 회의 원문은 검색·페이지 조회 도구로만 읽는다.
- 회의 메모(Tiptap Markdown)는 AI가 절대 덮어쓰지 않는다. 전사와 요약은 불변 버전으로 쌓는다.
- `gpt-4o-transcribe-diarize`는 요청당 25MB, 약 1,400초 제한이 있다. 긴 회의는 세그먼트로 나눈다.
- 모바일 MediaRecorder는 WebM/Opus와 MP4/AAC를 기능 감지로 모두 받아야 한다. 녹음 중에는 Screen Wake Lock을 요청한다.
- 한국어 시간 표현("오후 세 시 반")과 Asia/Seoul 자정 경계는 서버에서 명시적으로 처리한다.

---

## 3. 범위

### 3.1 v1 포함

- 모듈: `chat`(독 + 전체 대화), `tasks`, `calendar`, `meetings`, `memory`, `insights`, `settings`
- 인증(단일 사용자 allowlist), PWA 설치와 오프라인 셸, 앱이 열린 상태의 작업 완료 알림
- 데이터 내보내기(JSON/Markdown)와 삭제

### 3.2 v1 제외 — 나중에 끼워 넣을 모듈 후보

| 후보 | 왜 지금은 아닌가 | 붙일 때 필요한 것 |
| --- | --- | --- |
| `bots` 전문 봇과 @멘션 | 단일 레이첼로 충분하고 멀티 에이전트는 비용·복잡도가 크다 | 봇별 도구 allowlist, 오케스트레이션 잡 |
| `people` 사람·관계 | `entities` 테이블로 기초는 마련된다 | 모듈 UI + 인사이트 |
| `routines` 루틴·습관 | 칸반 반복 카드로 대체 가능 | 스케줄 잡 + 롤업 지표 (§4.5의 예시) |
| `journal` 일기·회고 | 주간 리뷰가 일부 커버 | 인덱서 + 기억 추출 |
| `mail` Gmail 요약·액션 | OAuth 범위 확장과 프라이버시 검토 필요 | 인덱서 + 제안 카드 |
| `notion`/`slack` 연동 | 외부 쓰기 범위 | 통합 어댑터 |
| `voice` 핸즈프리 대화 | 텍스트 우선 | Realtime 음성 어댑터 |
| Web Push 아침 브리핑 | v1.1 | VAPID 키, 구독 테이블, pg_cron |

---

## 4. 시스템 아키텍처

### 4.1 기술 스택

| 영역 | 선택 | 이유 |
| --- | --- | --- |
| 프레임워크 | Next.js 16 App Router, React 19, TypeScript strict, pnpm | RSC 초기 조회, Server Actions, Route Handler 스트리밍 |
| UI | Tailwind v4, shadcn/ui(radix-mira 프리셋), Phosphor Icons, dnd-kit, Tiptap(Markdown), shadcn Chart(Recharts) | 사용자 선호, 검증된 조합 |
| DB | Supabase Postgres + `pgvector` + `pg_trgm` + `pg_cron` + `pg_net` | 검색·스케줄·큐를 DB 하나로 |
| 데이터 접근 | Drizzle ORM + postgres.js(Supavisor 트랜잭션 풀러, `prepare: false`) | 타입 스키마 = 객체화. 집계·벡터·전문 검색을 SQL로 자유롭게 |
| 인증 | Supabase Auth(Google 로그인) + 이메일 allowlist | RLS와 자연스럽게 결합, 나중에 다중 사용자로 확장 가능 |
| 파일 | Supabase Storage(비공개 버킷, 서명 URL, 재개 가능 업로드) | 무료 1GB, 보존 정책으로 관리 |
| 실시간 | Supabase Realtime(broadcast, postgres_changes) | 잡 상태·자막을 폴링 없이 동기화 |
| AI 런타임 | Vercel AI SDK v6 + `@ai-sdk/openai` | 스트리밍 UI(`useChat`), 도구 루프, 구조화 출력, 프로바이더 교체 |
| 모델 | 텍스트 전 역할 `gpt-5.6-luna` · 임베딩 `text-embedding-3-small`(512차원) · 자막 `gpt-4o-mini-transcribe` · 정식 전사 `gpt-4o-transcribe-diarize` · 옵션 `gpt-live-transcribe` | 비용과 기능의 균형 (§10) |
| 호스팅 | Vercel Hobby, Fluid compute(Node), 함수 리전 icn1 · Supabase 리전 ap-northeast-2(서울) | 같은 리전으로 지연 최소화, 무료 |
| 백그라운드 | DB 잡 러너(`jobs` 테이블 + 단계 함수) + `after()` 재호출 + pg_cron | 추가 인프라 0. 나중에 Workflow DevKit 어댑터로 교체 가능 |
| PWA | `app/manifest.ts` + Serwist 서비스워커 | 설치, 오프라인 셸, 알림 |
| 테스트 | Vitest, Playwright, pgTAP(`supabase test db`), 도구 호출 eval | 모듈별 계약 검증 |
| 관측 | `ai_usage` 원장, Vercel Logs, Speed Insights(무료 범위) | 비용·성능 가시화 |

### 4.2 배포 토폴로지

```text
┌──────────── 사용자 기기 (PWA: 데스크톱 브라우저 · iPhone/Android 홈화면) ────────────┐
│ shadcn UI · 레이첼 독 · 칸반(dnd-kit) · 캘린더 · 회의 녹음(MediaRecorder×2) · Tiptap  │
└───────────────┬──────────────────────────┬──────────────────────────┬────────────────┘
                │ HTTPS · RSC · Server Actions │ 재개 가능 업로드(TUS)    │ Realtime WebSocket
                ▼                             ▼                         ▼
┌────────── Vercel (icn1, Fluid Node) ──────────┐   ┌──────── Supabase (ap-northeast-2) ────────┐
│ Next.js 16 App Router                          │   │ Postgres: 모듈 스키마 · RLS · pgvector      │
│  · RSC 조회 / Server Actions / Route Handlers  │◄─►│   pg_trgm · pg_cron(+pg_net → /api/cron/*)  │
│  · /api/chat            AI SDK 스트리밍        │   │ Auth(Google, allowlist)                     │
│  · /api/jobs/run        단계 실행, after() 재호출│   │ Storage(recordings, 비공개)                 │
│  · /api/google/*        OAuth, push 채널 수신  │   │ Realtime(잡 상태 · 자막 브로드캐스트)        │
│  · /api/cron/*          일 1회 Vercel cron 백업 │   └─────────────────────────────────────────────┘
└──────────────────────────┬─────────────────────┘        ┌──────────── 외부 API ────────────┐
                           └────────────────────────────►│ OpenAI: luna · embeddings ·        │
                                                          │   transcriptions(mini · diarize)   │
                                                          │ Google Calendar API                │
                                                          └────────────────────────────────────┘
```

- 브라우저는 API 키를 절대 받지 않는다. OpenAI·Google 호출은 모두 서버에서 한다. 예외는 WebRTC 실시간 전사 옵션의 임시 세션 토큰뿐이다.
- Mac이 꺼져 있어도 동작한다. 로컬 모델·로컬 파일 저장소·Tailscale은 없다.

### 4.3 모듈 아키텍처

커널(`core/`)과 모듈(`modules/`)의 두 층이다. 커널은 계약과 공용 인프라만 가진다. 도메인 지식은 전부 모듈에 있다.

```text
                 ┌───────────────────── core (커널) ─────────────────────┐
                 │ module.ts  registry.ts  agent/  ai/  db/  events/      │
                 │ jobs/  search/  storage/  auth/  time/  contracts/     │
                 └──────────────▲──────────────────────────▲──────────────┘
        구현(RachelModule)      │                          │  파생(조립)
   ┌────────┬────────┬─────────┴┬─────────┬─────────┐      │
   │ tasks  │calendar│ meetings │ memory  │insights │ …    │
   └────────┴────────┴──────────┴─────────┴─────────┘      │
                                                           ▼
   DB 스키마 · 사이드바 · 도구 목록 · 프롬프트 컨텍스트 · 검색 인덱스 · 이벤트 라우팅
   · 잡 카탈로그 · 대시보드 · 설정 화면 · 대화 카드 · 평가 스위트
```

레지스트리가 모듈에서 파생하는 것:

| 파생물 | 모듈이 내놓는 것 | 소비처 |
| --- | --- | --- |
| DB 스키마·RLS | `schema` | drizzle-kit 마이그레이션 |
| 사이드바·라우트 | `nav`, `ui` | 워크스페이스 셸 |
| 레이첼 도구 목록 | `tools` | 에이전트 런타임(서버 allowlist) |
| 프롬프트 컨텍스트 | `context`, `screenContext` | 컨텍스트 빌더(토큰 예산) |
| 검색 인덱스 | `indexers` | 통합 하이브리드 검색 |
| 이벤트 라우팅 | `events` | 이벤트 버스·원장 |
| 잡 정의 | `jobs` | 잡 러너 |
| 대시보드 | `insights` | 롤업 잡, Insights 화면, 주간 리뷰 프롬프트 |
| 설정 섹션 | `settings` | Settings 화면 |
| 대화 카드 | `dockCards` | 독과 전체 대화의 렌더러 |
| 평가 | `evals` | `pnpm eval` |

모듈 간 규칙:

- 모듈은 다른 모듈의 `repository`를 import하지 않는다. 통신은 ① 이벤트 ② 검색 인덱스 ③ `core/contracts`에 공개한 서비스 인터페이스, 세 가지뿐이다.
- `app/`은 라우팅과 조립만 한다. 비즈니스 로직은 `modules/*/service.ts`에 있다.
- 도구 이름은 `<module>.<verb>` 형식이고, 부팅 시 중복을 검사한다.
- 외부 상태를 바꾸거나 비용이 드는 도구는 `confirm: true`를 선언해야 하며, 런타임이 제안 카드로 강제한다.
- 모듈은 자기 이벤트 타입만 발행한다. 다른 모듈의 이벤트는 구독만 한다.

### 4.4 폴더 구조

```text
rachel/
├─ app/                              # 라우팅 전용. 페이지는 모듈 UI를 조립만 한다
│  ├─ (workspace)/                   # 사이드바 셸 + 전역 독
│  │  ├─ page.tsx                    # Today
│  │  ├─ board/[boardId]/page.tsx    # 칸반
│  │  ├─ calendar/page.tsx
│  │  ├─ meetings/page.tsx
│  │  ├─ meetings/[meetingId]/page.tsx
│  │  ├─ meetings/[meetingId]/live/page.tsx
│  │  ├─ insights/page.tsx
│  │  ├─ rachel/page.tsx             # 전체 화면 대화
│  │  └─ settings/page.tsx
│  ├─ (auth)/login/page.tsx
│  ├─ api/
│  │  ├─ chat/route.ts               # AI SDK 스트리밍
│  │  ├─ jobs/run/route.ts           # 잡 러너 (비밀 헤더)
│  │  ├─ cron/[task]/route.ts        # pg_cron / Vercel cron 진입점
│  │  ├─ google/{connect,callback,push}/route.ts
│  │  ├─ meetings/[meetingId]/{captions,segments,realtime-session}/route.ts
│  │  └─ storage/sign/route.ts
│  ├─ manifest.ts · layout.tsx · globals.css · error.tsx · offline/page.tsx
│  └─ proxy.ts                       # 세션 검사(Next 16의 middleware)
├─ modules/                          # ★ 기능 모듈. 폴더 하나 = 기능 하나
│  ├─ chat/        ├─ tasks/      ├─ calendar/   ├─ meetings/
│  ├─ memory/      ├─ insights/   ├─ settings/
│  └─ index.ts                       # registerModules([...]) 단 한 곳
├─ core/                             # ★ 커널: 계약과 공용 인프라
│  ├─ module.ts                      # RachelModule 인터페이스 (부록 B)
│  ├─ registry.ts                    # 검증 + 파생물 생성
│  ├─ contracts/                     # 모듈 간 공개 인터페이스 타입
│  ├─ agent/   runtime.ts context-builder.ts proposals.ts prompts/
│  ├─ ai/      provider.ts roles.ts usage.ts embeddings.ts transcription.ts
│  ├─ db/      client.ts rls.ts schema.ts(모듈 스키마 집계)
│  ├─ events/  bus.ts ledger.ts
│  ├─ jobs/    runner.ts define.ts adapters/{db,workflow-devkit}.ts
│  ├─ search/  index.ts hybrid.ts chunking.ts
│  ├─ storage/ blob.ts adapters/supabase.ts
│  ├─ auth/    session.ts allowlist.ts
│  ├─ time/    seoul.ts
│  └─ config/  env.ts (zod로 검증된 환경 변수)
├─ components/ui/                    # shadcn CLI 생성물만
├─ components/                       # 공용 조합 컴포넌트(ai-activity, markdown, confirm-card, empty-state)
├─ supabase/                         # config.toml, migrations(drizzle 출력), seed.sql, tests/*.sql(pgTAP)
├─ drizzle.config.ts
├─ evals/                            # 도구 호출 평가 러너 + 결과
├─ e2e/                              # Playwright
└─ docs/                             # PRD.md, adr/, module-guide.md
```

모듈 폴더의 표준 구성:

```text
modules/<name>/
├─ index.ts        # export const module: RachelModule
├─ schema.ts       # Drizzle 테이블 + RLS 정책 선언
├─ repository.ts   # DB 접근. core/db의 트랜잭션·RLS 헬퍼만 사용
├─ service.ts      # 도메인 규칙, 이벤트 발행
├─ tools.ts        # 레이첼 도구(zod 입력) → service 호출
├─ context.ts      # 프롬프트 블록, 화면 맥락
├─ indexer.ts      # 검색 청크 제공
├─ jobs.ts         # 백그라운드 단계 함수
├─ insights.ts     # 지표 계산 + 인사이트 프롬프트 조각
├─ events.ts       # 이벤트 타입, 핸들러
├─ ui/             # 페이지 조각, 시트, 카드, 독 카드
├─ evals/          # 도구 호출 평가 케이스
└─ __tests__/
```

### 4.5 모듈 추가 절차 (예: `routines`)

1. `modules/routines/schema.ts`에 `routines`, `routine_logs` 테이블과 RLS 정책을 선언한다.
2. `service.ts`에 "오늘 완료 처리" 규칙을 쓰고 `routine.completed` 이벤트를 발행한다.
3. `tools.ts`에 `routines.log`, `routines.list`를 정의한다.
4. `context.ts`에 "오늘 남은 루틴 3개"를 150토큰 예산으로 내놓는다.
5. `insights.ts`에 스트릭 지표를 정의한다. 롤업 잡이 다음 날부터 자동 계산하고 백필 명령으로 과거를 채운다.
6. `ui/`에 Today 섹션 카드와 설정 조각을 만든다. 사이드바 항목 없이 Today 안에서만 살 수도 있다(`nav` 생략).
7. `modules/index.ts`에 등록하고 `pnpm db:generate && pnpm typecheck && pnpm eval:smoke`를 통과시킨다.

이 7단계가 하루 안에 끝나는지가 아키텍처의 검수 기준이다(§11 Phase 6).

### 4.6 공통 인프라

**이벤트 원장 (`core/events`)**
- 모든 상태 변화는 `activity_events`에 append한다(type, module, subject, payload, occurred_at).
- 핸들러는 트랜잭션 커밋 뒤 `after()`로 실행되며 이벤트 id 기준으로 멱등하다. 실패한 핸들러는 잡으로 재시도한다.
- 기억 추출, 롤업, 검색 인덱싱, 카드 제안이 모두 이 원장을 구독한다.

**잡 러너 (`core/jobs`)**
- `jobs(type, status, payload, step, attempts, run_after, locked_at)`와 `job_steps`. 각 잡은 단계 함수의 배열이고, 한 호출은 한 단계만 실행한다(호출당 시간 예산 240초).
- 트리거: 잡 생성 직후 `after()` → `/api/jobs/run`; 남은 단계가 있으면 스스로 다시 호출; 클라이언트의 "다시 시도"; pg_cron 1분 스윕(`pg_net`으로 같은 엔드포인트 호출); Vercel 일일 cron은 백업.
- 진행 상태는 `postgres_changes`로 화면에 흐른다. 폴링은 없다.
- 어댑터 인터페이스(`JobRunner`)로 나중에 Workflow DevKit으로 교체할 수 있다.

**검색 인덱스 (`core/search`)**
- `search_chunks(source_type, source_id, chunk_index, text, embedding vector(512), tsv, metadata)` 한 테이블. 모듈 인덱서가 청크를 등록한다.
- 하이브리드 검색: `pg_trgm` 유사도(한국어 조사·어미에 강함) + FTS(`simple`) + 벡터 코사인을 RRF로 합친다.
- 임베딩은 `text-embedding-3-small`을 512차원으로 줄여 쓴다. 비용은 같고 저장 공간은 1/3이다.

**AI 프로바이더·역할·비용 원장 (`core/ai`)**
- 역할: `chat`, `extract`, `summarize`, `review`, `embed`, `transcribe.live`, `transcribe.batch`. 역할→모델 매핑은 환경 변수로 덮어쓴다.
- 모든 호출은 `withUsage(role, module)` 래퍼를 지나며 `ai_usage(model, role, module, input_tokens, cached_tokens, output_tokens, audio_seconds, cost_usd, latency_ms)`에 기록된다.
- 월 예산(기본 $15): 80%에서 독에 경고, 120%에서 야간 정리·주간 리뷰를 멈춘다. 대화와 회의 전사는 계속된다.
- 프롬프트 캐시: 정적 부분(페르소나, 규칙, 도구 정의)을 앞에, 동적 부분을 뒤에 둔다. OpenAI 자동 프리픽스 캐시로 입력의 40% 이상이 $0.02/1M 요율을 받는 것을 목표로 한다.

**스토리지 (`core/storage`)**
- `BlobStore` 인터페이스(put/sign/delete/list). 기본 어댑터는 Supabase Storage 비공개 버킷 `recordings`. 서명 URL은 10분.
- 무료 1GB를 넘기면 Pro($25, 100GB) 또는 R2 어댑터를 선택한다. 앱 코드는 바뀌지 않는다.

**인증·RLS (`core/auth`, `core/db/rls.ts`)**
- Supabase Auth Google 로그인. `auth.users` insert 트리거가 `ALLOWED_EMAILS`에 없는 가입을 거부한다.
- 모든 테이블은 `user_id uuid not null default auth.uid()`와 정책 `user_id = auth.uid()`를 가진다.
- Drizzle 트랜잭션은 `withUser(userId)` 헬퍼로 `role authenticated`와 `request.jwt.claims`를 설정한 뒤 실행한다. 잡·cron도 같은 헬퍼로 소유자 id를 넣는다. 서비스 롤 키는 이 헬퍼 밖에서 쓰지 않는다.
- Google Calendar 토큰은 별도 OAuth 흐름으로 받아 `integrations`에 암호화 저장한다(Supabase Vault 또는 앱 레벨 AES-GCM).

**시간 (`core/time`)**
- 저장은 `timestamptz`, 하루 경계는 Asia/Seoul. "오늘"은 서버가 계산하고 클라이언트는 자정에 새로고침한다.
- 한국어 상대 시간("모레 오후 3시 반")은 도구 실행 전 서버 파서가 정규화하고, 모델이 만든 시각과 다르면 파서를 우선한다.

---

## 5. 데이터 모델

### 5.1 원칙

- 모든 테이블에 `id uuid`, `user_id`, `created_at`, `updated_at`. RLS 필수.
- 원본 유지: 전사·요약·기억은 UPDATE하지 않고 새 버전 또는 `supersedes_id` 행을 만든다.
- JSONB는 소스별 payload에만. 자주 필터하는 값은 타입 컬럼과 인덱스.
- 삭제는 `archived_at`(소프트) → 보존 정책 잡이 하드 삭제.

### 5.2 테이블

| 모듈 | 테이블 | 핵심 컬럼 |
| --- | --- | --- |
| core | `profiles` | display_name, timezone(기본 Asia/Seoul), locale, preferences jsonb |
| core | `integrations` | provider, account_email, scopes[], access_token_enc, refresh_token_enc, expires_at, status |
| core | `activity_events` | type, module, subject_type, subject_id, payload, occurred_at (append-only) |
| core | `jobs`, `job_steps` | type, status, payload, step, attempts, run_after, locked_at, error / name, status, output |
| core | `ai_usage` | model, role, module, input_tokens, cached_tokens, output_tokens, audio_seconds, cost_usd, latency_ms |
| core | `search_chunks` | source_type, source_id, chunk_index, text, embedding vector(512), tsv, metadata |
| core | `push_subscriptions` (v1.1) | endpoint, keys, device_label |
| chat | `conversations` | kind(main/topic), title, summary_md, summary_upto_message_id, last_message_at |
| chat | `messages` | conversation_id, role, parts jsonb(AI SDK UIMessage), token_count, client_request_id(unique) |
| chat | `tool_operations` | conversation_id, message_id, tool_name, input, requires_confirm, status(proposed/confirmed/executed/rejected/failed/expired), idempotency_key(unique), result, executed_at |
| tasks | `boards` | name, position, archived_at |
| tasks | `lists` | board_id, name, role(backlog/todo/doing/done), position, wip_limit |
| tasks | `cards` | board_id, list_id, title, description_md, due_at, priority, labels text[], checklist jsonb, links jsonb, rank text(fractional index), completed_at, archived_at, source(user/rachel/meeting) |
| tasks | `labels` | board_id, name, color_token |
| calendar | `calendars` | integration_id, google_id, name, color, selected, is_primary |
| calendar | `calendar_sync_states` | calendar_id, sync_token, last_full_sync_at, watch_channel_id, watch_expires_at |
| calendar | `calendar_events` | calendar_id, google_id, title, description, location, start_at, end_at, all_day, timezone, status, attendees jsonb, recurring_id, html_link, raw jsonb |
| calendar | `calendar_links` | event_id, target_type(meeting/card), target_id |
| meetings | `meetings` | title, status(live/processing/ready/failed), started_at, ended_at, calendar_event_id, notes_md, notes_revision, live_mode(chunked/realtime/off), audio_retain_until |
| meetings | `meeting_segments` | meeting_id, index, storage_path, mime, duration_ms, bytes, overlap_ms, status(uploading/stored/transcribed/deleted) |
| meetings | `meeting_transcripts` | meeting_id, version, kind(live/diarized), model, status |
| meetings | `meeting_transcript_segments` | transcript_id, seq, speaker_label, start_ms, end_ms, text |
| meetings | `meeting_speakers` | meeting_id, speaker_label, display_name, entity_id |
| meetings | `meeting_outputs` | meeting_id, transcript_id, version, summary_md, decisions jsonb, action_items jsonb, questions jsonb, suggested_title, model |
| memory | `entities` | kind(person/project/org/topic/place), name, aliases[], notes, embedding |
| memory | `memory_items` | source_event_id, supersedes_id, layer(episodic/semantic/procedural), kind, state(candidate/confirmed/retracted), title, content, confidence, valid_from, valid_to, observed_at, embedding, tsv |
| memory | `memory_links` | memory_id, target_type, target_id, relation |
| insights | `daily_rollups` | day, metrics jsonb + 핫 지표는 생성 컬럼, computed_at |
| insights | `insight_reports` | period(week/month), period_start, content_md, structured jsonb, model |

출처 경로는 항상 다음을 따른다.

```text
message → tool_operation → (execute) → activity_event → memory_item → memory_link
recording segment → transcript(version) → output(version) → activity_event → card proposal
```

### 5.3 보존 정책

| 데이터 | 기본 보존 | 비고 |
| --- | --- | --- |
| 녹음 세그먼트 | 30일 뒤 삭제 | 회의별 "보관" 토글로 예외. 전사·요약은 영구 |
| 자막용 20초 청크 | 저장하지 않음 | 전사 직후 폐기 |
| 메시지 | 영구 | 오래된 구간은 요약으로 압축해 컨텍스트에 사용 |
| 이벤트 원장 | 영구 | 인사이트 재계산의 근거 |
| `ai_usage` | 13개월 | 월 비교용 |
| 제안(tool_operations) | 24시간 뒤 `expired` | 확인하지 않은 제안 |

---

## 6. 에이전트(레이첼) 설계

### 6.1 실행 루프

```text
사용자 메시지 (독 또는 전체 화면, client_request_id 포함)
  → /api/chat: 컨텍스트 빌더가 프롬프트 조립 (§6.2)
  → AI SDK streamText(luna, tools=레지스트리 allowlist, maxSteps=6)
       ├─ 조회 도구: 즉시 실행, 결과를 모델에 반환
       ├─ 내부 변경 도구(카드): 즉시 실행 + 이벤트 + "되돌리기" 30초
       └─ confirm 도구: 실행하지 않고 제안(tool_operation) 생성 → 카드 렌더
  → 응답 스트리밍 → 메시지 저장 → activity_event → (after) 인덱싱·기억 후보
```

- 같은 `client_request_id`의 재시도는 저장된 응답을 그대로 돌려준다. 카드나 제안이 두 번 생기지 않는다.
- 스트리밍 도중 연결이 끊겨도 서버는 완료까지 실행하고 저장한다. 독을 다시 열면 이어서 보인다.

### 6.2 컨텍스트 구성

캐시 친화적 순서로 조립한다. 정적 블록이 앞에 온다.

| 순서 | 블록 | 예산(토큰) | 갱신 주기 |
| --- | --- | --- | --- |
| 1 | 페르소나·행동 규칙·출력 형식 | 1,200 | 배포 시 |
| 2 | 도구 정의(레지스트리 파생, 정렬 고정) | 2,500 | 배포 시 |
| 3 | 프로필 + procedural 기억(사용자가 정한 규칙) | 500 | 하루 |
| 4 | 화면 맥락(현재 라우트의 `screenContext`) | 400 | 턴마다 |
| 5 | 검색된 기억·청크(질문 임베딩 기준 상위 8) | 1,500 | 턴마다 |
| 6 | 라이브 스냅샷: 오늘·내일 일정, 열린 카드 제목 ≤40, 처리 중 회의 | 1,200 | 턴마다 |
| 7 | 대화: 이전 구간 요약 + 최근 메시지 ≤12 | 2,900 | 턴마다 |

- 합계 약 10k 토큰, 그중 약 4k가 캐시된다. 턴당 예상 비용 약 $0.002.
- 회의 전사 원문, 오래된 대화, 완료된 카드는 기본 컨텍스트에 넣지 않는다. 도구로 찾는다.
- 대화가 길어지면 `summary_upto_message_id`까지를 luna로 요약해 블록 7을 유지한다.

### 6.3 도구 카탈로그 (v1)

| 도구 | 종류 | 확인 | 설명 |
| --- | --- | --- | --- |
| `search.everything` | 조회 | — | 모든 모듈의 청크를 하이브리드 검색, 타입·기간 필터 |
| `memory.search` | 조회 | — | 층·기간·엔티티 필터 |
| `memory.remember` | 내부 변경 | — | 사용자가 명시적으로 부탁한 기억은 즉시 confirmed |
| `memory.forget` | 내부 변경 | ✔ | retract 행 추가 |
| `tasks.list` | 조회 | — | 보드·리스트·필터(오늘/기한 지남/라벨) |
| `tasks.create_card` | 내부 변경 | — | 제목·기한·라벨·설명, 상대 시간 정규화 |
| `tasks.update_card` / `tasks.move_card` / `tasks.complete_card` | 내부 변경 | — | 되돌리기 가능 |
| `tasks.archive_card` | 내부 변경 | ✔ | |
| `tasks.create_cards_from_items` | 내부 변경 | ✔ | 회의 액션아이템 등 여러 개를 한 번에 |
| `calendar.list_events` | 조회 | — | 기간, 캘린더 선택 |
| `calendar.find_free_slots` | 조회 | — | 근무 시간·최소 길이·참석자 힌트 |
| `calendar.propose_create` / `propose_update` / `propose_delete` | 외부 변경 | ✔ | Google Calendar 반영 |
| `meetings.search` / `meetings.get` / `meetings.list_recent` | 조회 | — | `get`은 메모 offset·전사 seq 커서로 페이지 조회 |
| `meetings.rerun_outputs` | 비용 발생 | ✔ | 요약·액션 재생성 |
| `insights.query` | 조회 | — | 사전 정의된 지표 템플릿에 기간 파라미터. 자유 SQL 없음 |
| `insights.latest_report` | 조회 | — | 최근 주간·월간 리뷰 |

새 모듈은 자기 도구를 추가할 뿐, 이 표를 수정하지 않는다.

### 6.4 제안 → 확인 → 실행

1. `confirm: true` 도구는 `prepare(input)`만 실행한다. 정규화된 입력, 미리보기(예: "9/4 목 14:00–14:30 · 김OO"), 영향(변경/삭제 대상, 예상 비용)을 담은 `tool_operation`을 `proposed`로 만든다. `idempotency_key = hash(conversation, message, tool, normalized input)`.
2. 모듈의 `dockCards` 렌더러가 카드를 그린다. 카드는 독과 전체 화면 어디서나 같은 컴포넌트다.
3. 확인 → Server Action `confirmOperation(id)` → 고유 키 아래 `execute` → `executed` → 대화에 결과 메시지("일정을 만들었습니다 · Google에서 열기")가 도구 결과로 추가돼 다음 턴에 레이첼이 안다. 거절도 메시지로 남는다.
4. 확인을 두 번 눌러도, 새로고침 뒤 다시 눌러도 결과는 하나다. 24시간 지나면 `expired`.

내부 데이터(카드) 변경은 바로 실행하되 30초 "되돌리기"를 제공한다. 역연산은 이벤트 payload에서 만든다.

### 6.5 기억 정책

| 경로 | 조건 | 상태 |
| --- | --- | --- |
| 명시적 | "기억해", "앞으로는 ~해줘" | 즉시 `confirmed`, 출처 = 메시지 |
| 암묵적 | 야간 정리 잡이 그날의 이벤트·메시지·회의 결과에서 추출(luna 구조화 출력) | `candidate`, 신뢰도 기록 |
| 검토 | Today 상단에 후보 ≤3개 "어제 이런 걸 기억해둘까요?" 한 번 탭 | `confirmed` 또는 `retracted` |
| 교정 | "그거 아니야, 화요일이었어" | `supersedes_id`로 새 행 |
| 조회 | 턴마다 상위 8개(하이브리드), procedural은 항상 | — |
| 출처 | 모든 기억은 `source_event_id`를 가진다. UI는 "출처: 9/1 회의 '주간 싱크'" | — |

`layer` 정의: episodic(언제 무슨 일이 있었나), semantic(사람·프로젝트·선호 같은 사실), procedural(사용자가 정한 규칙, 예: "외부 미팅은 오전 선호").

### 6.6 안전장치와 예산

- 서버 allowlist: 모델이 만든 도구 이름이 레지스트리에 없으면 실행하지 않는다. 입력은 zod로 검증한다.
- 턴당 최대 도구 단계 6, 출력 1,024토큰, 입력 16k 상한.
- 모델 호출은 `store: false`. 로그에 프롬프트 원문을 남기지 않는다(토큰 수만).
- 예산 초과 동작은 §4.6.
- 사실 주장에는 출처 링크(회의·기억·일정)를 붙이는 규칙을 시스템 프롬프트와 평가 케이스로 고정한다.

---

## 7. 기능 명세

### 7.1 채팅 독 (`chat`)

**목적:** 어떤 화면에서든 현재 작업을 보면서 한 문장으로 일을 시킨다.

- 위치: 오른쪽 아래 FAB(64px 높이 확장형). 데스크톱은 `Popover`(최대 448×608), 모바일은 하단 `Sheet`(높이 85vh). safe-area 반영.
- 단축키: `⌘J`/`Ctrl+J` 열기, `Esc` 닫기(포커스는 FAB로 복귀), `⌘Enter` 전송.
- 화면 맥락 칩: "보고 있는 것: 회의 '주간 싱크'" 같은 한 줄. 탭하면 맥락 제외 가능.
- 제안 칩: 화면별 3개(회의 화면 "액션아이템 카드로", 캘린더 "빈 시간 찾아줘", 보드 "오늘 우선순위 정리").
- 스트리밍 응답(Markdown, GFM), 도구 진행은 `AiActivity`(thinking orb) 한 줄 상태로만.
- 확인 카드(§6.4)와 결과 카드(카드 생성됨 → 보드 링크)를 대화 안에 렌더.
- 음성 입력: 누르고 말하기 → `gpt-4o-mini-transcribe` → 입력창에 텍스트. 전송 전 수정 가능.
- 전체 화면 `/rachel`: 같은 스레드. "새 대화"는 컨텍스트 창을 리셋할 뿐 이력은 남는다. 주제 스레드(회의 페이지에서 "이 회의에 대해 대화")는 `kind=topic`.
- 안 읽은 결과 배지: 다른 화면에서 잡이 끝나면 FAB에 점 표시. Settings에서 켠 경우 브라우저 알림(앱이 열려 있고 화면이 가려진 때만).

**완료 조건:** 320px에서 문서 가로 overflow 없음, 키보드만으로 열기·전송·확인·닫기 가능, 첫 토큰 p50 1.5초 이내.

### 7.2 칸반 (`tasks`)

**목적:** 트렐로처럼 가볍게, 그러나 레이첼과 인사이트가 열의 의미를 아는 보드.

- 모델: 보드 ≥1(기본 "개인"), 리스트(기본 할 일/진행 중/완료, `role` 지정, 추가·이름 변경·순서 변경 가능), 카드.
- 카드: 제목, 설명(Markdown), 기한(날짜 또는 일시), 우선순위(0–3), 라벨(보드별 색 토큰), 체크리스트, 연결(회의·일정·URL), 출처 배지(레이첼/회의가 만든 카드).
- 조작: dnd-kit 드래그(리스트 간·보드 간), 카드 메뉴로 같은 이동 가능(접근성), 빠른 추가(리스트 하단 입력, `N` 키), 키보드 이동(`J/K`, `[`/`]`), 카드 상세는 `Sheet`.
- 정렬: fractional index(`rank text`)로 재번호 없이 삽입.
- 뷰: 보드 / 오늘(기한 오늘 ∪ 진행 중 ∪ 기한 지남) / 이번 주 / 라벨 필터. Today 화면은 "오늘" 뷰를 임베드.
- 규칙: 완료 카드는 완료한 Seoul 날짜가 지나면 보드에서 접히고, 14일 뒤 자동 보관(설정 가능).
- 레이첼: 자연어 → 카드(기한 파싱), 회의 액션아이템 → 카드 묶음 제안, "오늘 뭐부터 할까" → 기한·우선순위·회의 근거로 정렬 제안.
- 낙관적 업데이트(`useOptimistic`), 실패 시 롤백과 토스트.

**완료 조건:** 드래그 60fps(모바일 포함), 50개 카드 보드에서 첫 렌더 1초 이내, 레이첼이 만든 카드에 출처 링크.

### 7.3 캘린더 (`calendar`)

**목적:** Google Calendar를 원본으로 보고 관리하되, 레이첼의 조율은 확인 뒤 반영한다.

- 연결: Settings에서 Google 계정 연결(오프라인 액세스, `calendar.events` + `calendar.readonly`). 동기화할 캘린더 선택.
- 동기화: 최초 전체(−30일~+90일) → `syncToken` 증분. 트리거는 화면 진입, 탭 포커스, 레이첼의 일정 사용 직전, Google push 채널(`/api/google/push`, 채널은 만료 전 pg_cron으로 갱신). `410 Gone`이면 전체 재동기화.
- 뷰: 월(기본) / 주 / 일, 모바일은 7열 날짜 선택기 + 선택일 아젠다. 이전·오늘·다음.
- 상세 `Sheet`: 시간·장소·참석자·설명·Google 링크, "회의 시작"(meetings 연결), "카드 만들기".
- 편집: UI의 생성·수정·삭제는 바로 Google에 반영(사용자가 직접 한 행동). 레이첼의 제안은 확인 카드. 충돌(겹침)은 제안 카드에 경고로 표시.
- 빈 슬롯 찾기: 근무 시간(설정), 최소 길이, 이동 시간 버퍼를 고려해 상위 3개 제안.
- 시간대: Asia/Seoul 기본, 이벤트 원래 시간대 보존.

**완료 조건:** 외부에서 바꾼 일정이 60초 안에 화면에 반영(push), 같은 확인 두 번에 일정 하나, 종일·반복·자정 걸침 표시 정확.

### 7.4 회의 (`meetings`)

**목적:** 준비 없이 바로 시작하고, 끝나면 정리돼 있고, 나중에 찾을 수 있다.

**시작**
- Meetings 홈의 `새 회의 시작` 또는 일정의 `회의 시작`. 제목 없이 시작하고 나중에 바꾼다(요약이 제목을 제안).
- 실시간 화면: 왼쪽 메모(Tiptap Markdown, 800ms 디바운스 자동 저장, `notes_revision` 충돌 감지), 오른쪽 자막(읽기 전용). 모바일은 `Tabs`.
- 주 행동은 `회의 종료` 하나. 상태는 `녹음 중 · 자막 켜짐 · 저장됨` 정도만 조용히.

**녹음 (데이터를 잃지 않는 구조)**
- 보관용 레코더: 10분 독립 세그먼트. 다음 레코더를 10초 먼저 시작해 세그먼트 간 10초 겹침을 만든다(두 레코더 교차). mono, 32kbps Opus(iOS는 AAC 기능 감지).
- 세그먼트는 IndexedDB에 먼저 쓰고 Supabase Storage로 재개 가능 업로드(TUS). 네트워크가 끊겨도 녹음은 계속되고, 다음에 앱을 열면 미업로드 세그먼트를 이어서 올린다.
- 서버는 세그먼트 매니페스트를 관리한다. 종료 시 매니페스트가 완전해야 후처리를 시작한다.
- Screen Wake Lock, 이탈 확인, 화면 잠금·앱 전환은 실기기 검수 항목.

**자막 (`LiveTranscriber` 어댑터)**
| 모드 | 방식 | 지연 | 비용 |
| --- | --- | --- | --- |
| `chunked`(기본) | 자막용 레코더를 20초마다 재시작 → 독립 파일 → 서버 → `gpt-4o-mini-transcribe`(language=ko, 고유명사 프롬프트) → 자막 append + Realtime 브로드캐스트 | 20–25초 | $0.003/분 |
| `realtime`(옵션) | 서버가 임시 세션 토큰 발급 → 브라우저 WebRTC → `gpt-live-transcribe` | 1초 미만 | $0.017/분 |
| `off` | 녹음만 | — | $0 |
- 무음 청크(RMS 임계값 이하)는 보내지 않는다.
- 자막 연결이 끊겨도 녹음·메모는 영향받지 않는다. 자막은 `kind=live` 전사 버전으로 저장된다.

**종료 후 파이프라인 (잡 `meeting.finalize`)**
1. 매니페스트 검증(모든 세그먼트 `stored`).
2. 세그먼트별 `gpt-4o-transcribe-diarize`(요청당 ≤25MB, ≤1,400초). 한 호출에 한 세그먼트, 실패 세그먼트만 재시도.
3. 병합: 겹침 구간의 라벨 정렬로 화자 연결, 중복 문장 제거, 타임라인 보정 → `kind=diarized` 전사 버전.
4. 결과(luna 구조화 출력): 요약, 결정, 액션아이템(담당·행동·기한·확신도), 열린 질문, 제안 제목. 사용자 메모는 읽기만 한다.
5. 인덱싱: 전사 청크(약 500토큰)와 요약을 `search_chunks`에.
6. 연결: 액션아이템 → 메인 대화에 "카드 3개 만들기" 확인 카드, 일정이 있으면 `calendar_links`.
7. 알림: Realtime 상태 `ready`, FAB 배지, (v1.1) Web Push.
- 어느 단계가 실패해도 live 전사와 메모는 그대로 남고 "다시 시도"가 보인다.

**결과 화면**
- 순서: 요약 → 결정 → 액션아이템(카드로 만들기) → 열린 질문 → 메모 → 화자별 전사(재생과 동기화, 화자 이름 바꾸기) → 이전 버전(더보기).
- "이 회의에 대해 대화" → 주제 스레드. 내보내기(Markdown). 오디오 보관 토글.

**완료 조건:** 60분 회의 종료 후 5분 안에 `ready`, 120분 회의가 세그먼트 12개로 처리, 네트워크 단절 10분 뒤 세그먼트 손실 0, iPhone Safari와 Android Chrome에서 같은 흐름.

### 7.5 기억 (`memory`)

- Settings > 기억: 검색, 층·상태 필터, 후보 검토(확인/제외), 교정, 삭제(retract), 출처 보기, 내보내기.
- 엔티티: 사람·프로젝트·조직·주제. 회의 화자 이름 지정과 기억 추출이 엔티티를 만들고 연결한다. 레이첼은 엔티티로 범위를 좁혀 검색한다("김OO 관련해서").
- 야간 정리 잡(pg_cron 03:00): 그날 이벤트·메시지·회의 결과 → 후보 추출 → 중복·모순 검사 → Today 검토 큐.
- 정책 상세는 §6.5.

### 7.6 인사이트 (`insights`)

**목적:** 쌓인 데이터에서 패턴을 보여주고, 레이첼이 그 수치를 근거로 제안한다.

- 롤업 잡(pg_cron 00:30, Vercel cron 백업): 전날 `daily_rollups` 계산. 각 모듈의 `InsightProvider`가 지표를 내놓는다.
- v1 지표: 카드 생성·완료 수, 완료율, 사이클 타임 중앙값(doing→done), 기한 지남 수, WIP, 회의 수·분, 회의→액션→완료 전환율, 캘린더 바쁜 시간과 파편화(30분 미만 공백 수), 포커스 블록(90분 이상 빈 시간), 대화 턴 수, 기억 증가, AI 비용.
- 화면 `/insights`: 기간 선택(주/월) → 스탯 타일 4개 → 차트(완료 추이 line, 시간 배분 stacked bar: 회의/포커스, 요일×시간 활동 heatmap, 리드타임 분포) → "레이첼의 주간 리뷰" 카드 → 질문 입력(독으로 연결, `insights.query`).
- 주간 리뷰(pg_cron 월 07:00, luna): 지난주 수치 + 관련 기억 → 잘된 것, 병목, 패턴, 다음 주 제안 3개. Today 상단에도 요약 한 줄.
- 규칙: 요청 경로에서 90일 넘는 원본 집계 금지. 롤업이 원본. 새 지표는 `InsightProvider` 추가 + 백필 명령.

**완료 조건:** 새 지표 추가 후 `pnpm insights:backfill`로 과거 90일이 채워짐, 대시보드 첫 렌더 1초 이내.

### 7.7 설정 (`settings`)

한 페이지 스크롤(최대 760px). 각 모듈의 `settings` 섹션을 순서대로 마운트한다.

1. 연결: Google(연결·재동의·캘린더 선택), OpenAI 상태
2. AI와 비용: 역할별 모델, 이번 달 사용량과 비용(모듈별), 월 예산
3. 회의: 자막 기본 모드, 오디오 보존 기간, 고유명사 목록(자막 프롬프트)
4. 기억: §7.5
5. 알림: 작업 완료 알림 켜기(브라우저 권한은 여기서만 요청), (v1.1) Push
6. 데이터: 전체 내보내기(JSON + Markdown), 회의 오디오 일괄 삭제, 계정 데이터 삭제(`AlertDialog`)
7. 진단: DB·Storage·Realtime·Google·OpenAI 상태, 잡 큐 상태, 최근 실패

비밀 값은 서버 환경 변수에만 있고 화면에는 설정 여부만 보인다.

### 7.8 PWA

- `app/manifest.ts`, 192/512/maskable 아이콘, Apple Web App 메타, `viewport-fit=cover`.
- 서비스워커(Serwist): 앱 셸·폰트·아이콘 프리캐시, 내비게이션 network-first + 오프라인 페이지. API·대화·일정·녹음은 캐시하지 않는다(v1).
- 녹음 중 오프라인: IndexedDB 버퍼(§7.4)가 담당한다. 서비스워커는 관여하지 않는다.
- 알림: 앱이 열린 상태의 작업 완료 알림(v1). Web Push(v1.1): 잡 완료, 아침 브리핑 07:00(pg_cron), 기억 후보 검토.
- v1.1 후보: Today·보드 읽기 전용 오프라인 캐시.

---

## 8. UX/UI

### 8.1 IA와 내비게이션

```text
Rachel
├── Today            /              오늘 일정 · 오늘 카드 · 기억 후보 · 처리 중 회의 · 브리핑 한 줄
├── Board            /board/[id]    칸반 (보드 전환은 상단 Select)
├── Calendar         /calendar
├── Meetings         /meetings      새 회의 시작 · 예정 회의 · 최근 회의 · 검색
├── Insights         /insights
└── Settings         /settings      [하단 고정]
    + 전역 레이첼 독 (모든 화면)   → 전체 화면 /rachel
```

- 데스크톱(≥1024px) 사이드바, 태블릿(768–1023px) 아이콘 레일, 모바일(≤767px) 하단 탭 5개(Today·Board·Calendar·Meetings·더보기).
- 생성·편집은 `Sheet`/`Dialog`. 경로는 화면이 정말 필요한 회의 실시간·결과에만.
- 승인함, 메모리 페이지, 알림 센터, 검색 페이지는 만들지 않는다. 독과 각 화면 안에서 맥락형으로 나타난다.

### 8.2 디자인 시스템

| 항목 | 기준 |
| --- | --- |
| 프리미티브 | shadcn/ui만. `components/ui/*`는 CLI 생성물만 |
| 프리셋 | `radix-mira`, Radix base, Tailwind v4 |
| 색 | 프리셋 의미 토큰만(background/foreground/card/primary/muted/accent/destructive/sidebar). 기능 코드에 hex 금지 |
| 글꼴 | 본문 Noto Sans(한글 서브셋, `next/font`), 큰 제목만 Noto Serif. 본문 14–16px |
| 아이콘 | Phosphor |
| radius | 프리셋 스케일(0.45rem) |
| 깊이 | 경계선으로 구분, 그림자는 overlay와 떠 있는 독에만. 카드 안 카드 금지 |
| 밀도 | 컴팩트: 목록 행 40px, 카드 패딩 12px, 섹션 간격 24px |
| 모션 | 150–200ms 색·투명도 전환. AI 상태는 `AiActivity`(thinking-orbs)만. `prefers-reduced-motion` 존중 |
| 다크 모드 | 프리셋 토큰 포함. v1은 시스템 설정을 따르고 토글 UI는 두지 않는다 |

### 8.3 상호작용 규칙

- 한 화면에 `default` 버튼 하나. 위험 행동은 `destructive` + `AlertDialog`.
- 모든 데이터 표면은 loading(구조를 닮은 `Skeleton`)·empty(한 문장 + 다음 행동 하나)·error(`Alert` + 재시도)·success를 같은 자리에서 처리한다. 전체 화면을 막지 않는다.
- 접근성: 키보드만으로 모든 조작, 아이콘 단독 버튼에 이름과 `Tooltip`, 터치 목표 44px, 포커스 링 유지, 색만으로 상태 전달 금지.
- 반응형: 320/768/1024/1440px에서 같은 정보 순서. 문서 가로 overflow 금지(칸반·표는 자체 스크롤).
- 문구: 사용자 관점의 이름("일정", "카드"), 능동태, 오류는 원인과 해결을 한 문장씩.

---

## 9. 비기능 요구사항

### 9.1 성능 예산

| 항목 | 목표 |
| --- | --- |
| Today TTFB | 300ms 이하 (RSC, 같은 리전) |
| Today LCP (모바일 4G) | 1.5초 이하 |
| INP | 100ms 이하 |
| 초기 JS (Today) | 180KB gzip 이하. Tiptap·차트·dnd는 해당 화면에서만 로드 |
| 채팅 첫 토큰 p50 | 1.5초 이하 |
| 칸반 드래그 | 60fps |
| 잡 상태 반영 | Realtime 1초 이내 |
| 회의 60분 후처리 | 5분 이내 `ready` |

수단: Server Components로 초기 조회, Server Actions + `useOptimistic`, 라우트별 코드 분할, `next/font`, 이미지 없음, Realtime으로 폴링 제거, Speed Insights로 실측.

### 9.2 신뢰성

- 오디오는 절대 잃지 않는다: IndexedDB → TUS → 매니페스트 3중 확인.
- 모든 잡은 단계별 재개 가능하고 멱등하다.
- OpenAI 장애: 녹음·메모 계속, 자막 꺼짐 표시, 후처리는 큐에서 대기. Google 장애: 캐시를 "마지막 동기화 시각"과 함께 보여주고 변경은 거부.
- Supabase 무료 프로젝트는 7일 비활성 시 일시정지된다. 일일 롤업 잡이 활동을 유지하고, 진단 화면이 상태를 보여준다.

### 9.3 보안·프라이버시

- 단일 사용자 allowlist + RLS + 서버 전용 비밀. 클라이언트 번들에 키·URL 없음.
- Storage는 비공개 버킷, 서명 URL 10분.
- 모델 호출 `store: false`. 로그에 원문 없음.
- 데이터 이동성: 전체 내보내기와 완전 삭제.
- Google OAuth 앱은 "프로덕션" 상태로 둔다. 테스트 상태의 refresh token은 7일마다 만료된다.

### 9.4 국제화·시간

- UI 언어 한국어(문구는 `messages/ko.ts`에 모아 나중에 영어 추가 가능).
- 시간대 Asia/Seoul, 하루 경계 서버 계산(§4.6).

---

## 10. 비용 모델

가격은 2026-09-02 OpenAI 가격표 기준이다. 달라지면 `core/ai/pricing.ts` 한 곳만 바꾼다.

| 항목 | 단가 |
| --- | --- |
| `gpt-5.6-luna` | 입력 $0.20 / 캐시 입력 $0.02 / 출력 $1.20 (per 1M 토큰) |
| `gpt-4o-mini-transcribe` | $0.003/분 |
| `gpt-4o-transcribe-diarize` | $0.006/분 |
| `gpt-live-transcribe` | $0.017/분 |
| `text-embedding-3-small` | $0.02 per 1M 토큰 |
| Supabase Free | $0 (DB 500MB, Storage 1GB, egress 5GB, 파일당 50MB) |
| Vercel Hobby | $0 (개인·비상업 용도, cron 일 1회, 함수 300초) |

월간 시나리오: 회의 20시간, 대화 500턴, 야간 정리·주간 리뷰·롤업.

| 항목 | 계산 | 월 비용 |
| --- | --- | --- |
| 회의 자막(chunked) | 20h × 60 × $0.003 | $3.60 |
| 회의 정식 전사(diarize) | 20h × 60 × $0.006 | $7.20 |
| 회의 요약·액션(luna) | 20 × 약 40k 입력 + 2k 출력 | $0.21 |
| 대화 | 500턴 × 약 $0.002 | $1.00 |
| 야간 정리 + 주간 리뷰 + 브리핑 | 약 40회 × 20k 입력 | $0.20 |
| 임베딩 | 약 300k 토큰 | $0.01 |
| 인프라 | Supabase Free + Vercel Hobby | $0 |
| **합계 (기본)** | | **약 $12.2** |
| 자막 끄면 | −$3.60 | 약 $8.6 |
| 진짜 실시간 자막이면 | +$16.80 (20h × 60 × ($0.017 − $0.003)) | 약 $29 |

- 회의 시간이 비용의 90%다. 회의별로 자막 모드를 고르고, 비용은 회의 시작 전에 "예상 $0.55/시간"으로 보여준다.
- Storage: 32kbps 세그먼트는 시간당 약 14MB. 30일 보존이면 20시간 기준 약 280MB로 무료 한도 안이다.
- 확장 시점: Storage 1GB 초과 → Supabase Pro($25) 또는 R2 어댑터. DB 500MB 초과(전사 청크 누적, 대략 2년 뒤) → Pro.

---

## 11. 구현 로드맵

각 Phase는 독립적으로 검증하고, 완료 조건을 통과하기 전에는 다음 Phase 기능을 섞지 않는다. 기간은 AI 코딩 에이전트와 함께하는 1인 기준이다.

| Phase | 사용자 결과 | 범위 | 완료 조건 |
| --- | --- | --- | --- |
| **0 기반** (1주) | 로그인하면 빈 작업공간이 열린다 | 프로젝트 생성, Supabase 프로젝트(서울)·Auth allowlist·Drizzle·RLS 헬퍼, 모듈 계약·레지스트리, 셸·내비·디자인 시스템, AI 프로바이더·역할·비용 원장, 잡 러너·이벤트 원장 골격, CI(lint/typecheck/test/pgTAP) | 빈 모듈 하나가 레지스트리를 통해 사이드바·설정·도구에 나타남. RLS 테스트 통과 |
| **1 대화 + 칸반** (2주) | 독에서 "내일까지 보고서 초안" 하면 카드가 생긴다 | `tasks` 전체, `chat` 독·전체 화면·스트리밍·제안 카드 프레임, `memory.remember/search` 기본(검색 인덱스 포함), Today v1 | §7.1·7.2 완료 조건, 도구 eval 스모크 통과 |
| **2 캘린더** (1–2주) | 일정을 보고, 레이첼이 잡아준 일정을 확인 뒤 반영한다 | OAuth, 증분 동기화 + push, 월/주/일, 상세 시트, 직접 편집, 제안 카드, 빈 슬롯 도구, 카드·일정 연결 | §7.3 완료 조건 |
| **3 회의** (2–3주) | 회의를 시작하고 끝내면 정리돼 있다 | 녹음 파이프라인, 자막 어댑터 2종, 메모, 종료 잡 6단계, 결과 화면, 액션→카드, 인덱싱, 보존 잡 | §7.4 완료 조건, 실기기 검수 |
| **4 기억 고도화** (1주) | 레이첼이 어제 일을 먼저 기억해 둔다 | 야간 정리, 후보 검토 UX, 엔티티, 하이브리드 검색 튜닝, 출처 링크 규칙, 기억 eval | 교차 질문 eval 통과(회의·기억·일정 근거 정확) |
| **5 인사이트** (1–2주) | 지난주를 숫자와 문장으로 본다 | 롤업 잡, `InsightProvider` 6개, 대시보드, 주간 리뷰, `insights.query` | §7.6 완료 조건 |
| **6 PWA·릴리스** (1주) | 폰 홈 화면에서 앱처럼 쓴다 | manifest·SW, 알림, 성능 실측·최적화, 접근성 점검, e2e, 문서. **아키텍처 검수: `routines` 모듈을 §4.5 절차로 하루 안에 추가** | §9 예산 충족, e2e 전부 통과, 모듈 추가 검수 통과 |
| **1.1** | 아침에 브리핑이 온다 | Web Push, 아침 브리핑, 오프라인 읽기 캐시, (선택) Workflow DevKit 어댑터 | — |

의존성: 0 → 1 → 2 → 3 → 4 → 5 → 6. Phase 2와 3은 순서를 바꿔도 된다.

---

## 12. 품질과 검증

| 층 | 도구 | 대상 |
| --- | --- | --- |
| 단위 | Vitest | service·도구 입력 정규화·시간 파서·랭크·병합 로직 |
| DB | pgTAP (`supabase test db`) | RLS 격리, 불변 버전, 멱등 키, 이벤트→기억 출처 제약 |
| 통합 | Vitest + 로컬 Supabase | 잡 러너 재개, 제안→확인→실행, 동기화 병합 |
| 브라우저 | Playwright | 핵심 여정 8개(로그인, 카드 생성·이동, 독 확인 카드, 일정 제안, 회의 시작·종료, 결과 화면, 설정, 320px 셸) |
| 에이전트 | 도구 호출 eval (`pnpm eval`) | 모듈별 케이스: 올바른 도구 선택, 인자 정규화, 확인 필요 도구는 제안만, 출처 링크 포함. 프롬프트·모델 변경 시 필수 실행 |
| 실기기 | 수동 게이트 | iPhone Safari·Android Chrome 녹음 10분, 네트워크 단절, 화면 잠금, 앱 전환 |

CI(GitHub Actions): `pnpm lint && pnpm typecheck && pnpm test && pnpm test:db && pnpm build`. e2e는 Vercel preview 배포에서 실행. 릴리스 게이트는 §11 Phase 6.

---

## 13. 결정 기록 (ADR 요약)

| # | 결정 | 대안 | 이유 |
| --- | --- | --- | --- |
| 1 | Supabase (Postgres·Auth·Storage·Realtime·cron) | Neon + 별도 서비스 | 사용자 요구. 한 계정으로 파일·실시간·스케줄까지 해결. 무료 티어에 scale-to-zero 콜드스타트가 없다 |
| 2 | 클라우드 상시 운영 (Vercel + Supabase) | Mac 프라이빗 런타임 + Tailscale | luna가 기본 모델이 되면서 로컬 모델 이유가 사라짐. 어디서나 낮은 지연, 운영 부담 0 |
| 3 | `gpt-5.6-luna` 전 역할 기본 | 로컬 Qwen, 상위 모델 혼합 | 사용자 요구. 역할 라우팅으로 나중에 부분 교체 가능 |
| 4 | Vercel AI SDK | 직접 Chat Completions 호출 | 스트리밍 UI·도구 루프·구조화 출력을 손으로 짜지 않음. 프로바이더 교체 용이 |
| 5 | Drizzle + postgres.js | supabase-js만 | 타입 스키마(객체화), 집계·벡터·FTS를 SQL로. supabase-js는 Auth·Storage·Realtime에만 |
| 6 | 준실시간 청크 자막 기본 | WebRTC 실시간 기본 | 비용 1/6, 회의 가치의 핵심은 후처리. 실시간은 어댑터 옵션 |
| 7 | 브라우저 세그먼트 녹음 (10분 + 10초 겹침) | 서버 ffmpeg 분할 | Vercel에 ffmpeg 불필요, 업로드 작고 재개 가능, 손실 범위 최소 |
| 8 | DB 잡 러너 + pg_cron | Workflow DevKit, 외부 큐 | 추가 인프라·요금 0. 어댑터로 교체 가능 |
| 9 | pgvector 하이브리드 검색을 v1에 포함 | FTS만 | 한국어 `simple` FTS는 재현율이 낮고 임베딩 비용은 무시 가능 |
| 10 | Bots는 v1 제외 | v0.1처럼 포함 | 단일 레이첼로 요구 충족. 모듈로 나중에 추가 |
| 11 | 이벤트 원장 → 롤업 → 인사이트 | 원본 테이블 즉시 집계 | 성능과 확장성. 새 지표 백필 가능 |
| 12 | Eve(Vercel 에이전트 프레임워크) 미채택 | 채택 | 자체 데이터 모델·Supabase 중심 설계와 겹침. 필요 시 재평가 |

---

## 14. 리스크

| 리스크 | 영향 | 대응 |
| --- | --- | --- |
| Supabase 무료 프로젝트 7일 비활성 일시정지 | 앱 접속 불가 | 일일 잡이 활동 유지, 진단 화면 경고, 장기 부재 전 Pro 전환 |
| 한국어 전사 품질(고유명사·전문용어) | 요약 정확도 저하 | 고유명사 목록 프롬프트, 화자 이름 지정, 결과 화면에서 수정 가능, 실회의 샘플로 측정 |
| iOS Safari 녹음 제약(화면 잠금·백그라운드) | 세그먼트 유실 | Wake Lock, IndexedDB 버퍼, 실기기 게이트, 안내 문구 |
| OpenAI 모델 변경·폐기 | 역할 매핑 깨짐 | 역할 라우팅 + 환경 변수 + 헬스체크 |
| Google OAuth 토큰 만료·재동의 | 동기화 중단 | 프로덕션 상태 앱, 만료 감지 시 Settings 배지와 독 안내 |
| 비용 초과 | 예산 이탈 | 비용 원장, 80/120% 정책, 회의 전 예상 비용 표시 |
| 모듈 경계 침식 | 유지보수성 저하 | import 경계 lint 규칙, 레지스트리 검증, 모듈 추가 검수 |
| 클라우드에 개인 데이터 집중 | 프라이버시 | RLS, 암호화 토큰, `store: false`, 내보내기·삭제 |

---

## 15. 열린 질문 (기본값 포함)

결정이 늦어도 Phase 0–1은 진행할 수 있다. 각 항목의 기본값으로 시작한다.

| # | 질문 | 기본값 |
| --- | --- | --- |
| 1 | 자막 기본 모드를 준실시간(20초)으로 둘까, 진짜 실시간으로 둘까? | 준실시간. 회의별 전환 가능 |
| 2 | 오디오 보존 기간은? | 30일, 회의별 보관 예외 |
| 3 | 로그인은 Google 계정으로 충분한가? (매직링크 대안) | Google |
| 4 | 동기화할 Google 캘린더는 하나인가 여럿인가? | 기본 캘린더 + 선택 |
| 5 | 보드는 하나로 시작해도 되나? | 기본 보드 하나, 추가 가능 |
| 6 | 데이터 리전 서울로 확정? | 서울(ap-northeast-2, icn1) |
| 7 | 카드 자동 보관 기준(완료 후 14일)? | 14일 |
| 8 | Bots 재도입 시점? | Phase 6 이후 필요성이 확인될 때 |

---

## 부록 A. 환경 변수

```dotenv
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=            # 서버 전용. withUser 헬퍼 밖에서 사용 금지
DATABASE_URL=                         # Supavisor 트랜잭션 풀러(6543), Drizzle 전용
DIRECT_DATABASE_URL=                  # 마이그레이션 전용
ALLOWED_EMAILS=jojorang89@gmail.com

# OpenAI
OPENAI_API_KEY=
AI_MODEL_CHAT=gpt-5.6-luna
AI_MODEL_EXTRACT=gpt-5.6-luna
AI_MODEL_SUMMARIZE=gpt-5.6-luna
AI_MODEL_REVIEW=gpt-5.6-luna
AI_MODEL_EMBED=text-embedding-3-small
AI_MODEL_TRANSCRIBE_LIVE=gpt-4o-mini-transcribe
AI_MODEL_TRANSCRIBE_BATCH=gpt-4o-transcribe-diarize
AI_MODEL_TRANSCRIBE_REALTIME=gpt-live-transcribe
AI_MONTHLY_BUDGET_USD=15

# Google
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=https://<app>.vercel.app/api/google/callback
GOOGLE_PUSH_VERIFY_TOKEN=

# 앱
APP_URL=https://<app>.vercel.app
INTEGRATION_ENCRYPTION_KEY=           # 32바이트 base64
JOB_RUNNER_SECRET=                    # /api/jobs/run, /api/cron/* 보호
AUDIO_RETENTION_DAYS=30
```

## 부록 B. 모듈 계약

```ts
// core/module.ts
import type { PgTable } from "drizzle-orm/pg-core";
import type { z } from "zod";

export interface RachelModule {
  id: string;                              // "tasks" — 도구 접두사, 이벤트 접두사
  version: number;
  schema?: Record<string, PgTable>;        // core/db/schema.ts가 집계
  nav?: NavEntry[];                        // 사이드바 항목 (없으면 다른 화면 안에서만 산다)
  tools?: AgentTool[];                     // 레이첼 도구
  context?: ContextProvider[];             // 턴마다 프롬프트 블록 (예산 포함)
  screenContext?: ScreenContextProvider;   // 현재 라우트에서 "보고 있는 것"
  indexers?: Indexer[];                    // search_chunks 제공
  events?: { emits: string[]; handlers: EventHandler[] };
  jobs?: JobDefinition[];                  // 단계형 백그라운드 작업
  insights?: InsightProvider[];            // 롤업 지표 + 리뷰 프롬프트 조각
  settings?: SettingsSection;              // Settings 화면 조각
  dockCards?: DockCardRenderer[];          // 대화 안 카드 (제안·결과)
  evals?: EvalCase[];
}

export interface AgentTool<I = unknown, O = unknown> {
  name: `${string}.${string}`;             // "tasks.create_card"
  description: string;
  input: z.ZodType<I>;
  confirm?: boolean;                        // true면 prepare→제안 카드→execute
  prepare?: (input: I, ctx: ToolContext) => Promise<Proposal>;
  execute: (input: I, ctx: ToolContext) => Promise<O>;
  undo?: (input: I, output: O, ctx: ToolContext) => Promise<void>;
}

export interface ContextProvider {
  id: string;
  budgetTokens: number;
  cacheable: "static" | "daily" | "turn";
  build: (turn: TurnContext) => Promise<ContextBlock | null>;
}

export interface JobDefinition<P = unknown> {
  type: string;                            // "meeting.finalize"
  steps: Array<{ name: string; run: (payload: P, state: JobState) => Promise<StepResult> }>;
  retry?: { max: number; backoffSeconds: number };
}

export interface InsightProvider {
  id: string;                              // "tasks.cycle_time"
  compute: (day: SeoulDay, userId: string) => Promise<Record<string, number>>;
  describe: string;                        // 주간 리뷰 프롬프트에 들어갈 지표 설명
}
```

```ts
// modules/index.ts — 등록은 이 한 곳
import { registerModules } from "@/core/registry";
import { chat } from "./chat";
import { tasks } from "./tasks";
import { calendar } from "./calendar";
import { meetings } from "./meetings";
import { memory } from "./memory";
import { insights } from "./insights";
import { settings } from "./settings";

export const registry = registerModules([chat, tasks, calendar, meetings, memory, insights, settings]);
// 부팅 시 검증: id·도구 이름 중복, confirm 도구의 prepare 존재, 컨텍스트 예산 합계 ≤ 8,000, zod → JSON Schema 변환 가능
```

## 부록 C. 용어

| 용어 | 뜻 |
| --- | --- |
| 독(Dock) | 모든 화면 오른쪽 아래의 레이첼 빠른 대화 |
| 제안(Proposal) | 실행되지 않은 도구 호출. 확인 카드로 표시 |
| 세그먼트 | 10분 단위 독립 녹음 파일 |
| 청크 | 검색용 텍스트 조각(약 500토큰) 또는 20초 자막용 오디오 |
| 롤업 | 하루 단위로 미리 계산한 지표 |
| 층(Layer) | 기억의 종류: episodic·semantic·procedural |
| 역할(Role) | AI 호출 목적 단위(chat, extract, …). 모델은 역할에 매핑 |
