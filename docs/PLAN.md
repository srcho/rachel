# Rachel 구현 플랜

| 항목 | 내용 |
|---|---|
| 버전 | v1.0 · 2026-09-02 |
| 상태 | **P6 완료(2026-09-03, S6.5 옵션 제외) — 실기기 검증 대기, 다음 = 사용자 실사용 피드백 반영 / S6.5(옵션)** |
| 기준 문서 | [PRD.md](./PRD.md) v1.0(무엇을·왜) · [ARCHITECTURE.md](./ARCHITECTURE.md) v1.0(어떻게) · 이 문서(언제·어떤 순서로) |
| 저장소 | `github.com/srcho/rachel` · 브랜치 `main` · 의미 단위 커밋 |
| 참고 | `docs/reference/PRD.taimen-v1.0.md`(병렬 세션 초안, 참고용) |

> 이 문서는 **세션이 바뀌어도 이어서 구현할 수 있도록** Step 단위로 산출 파일·구현 세부·검증·커밋을 적는다. 코드 수준의 결정(테이블 컬럼, 계약 인터페이스, 파이프라인)은 ARCHITECTURE.md에 있고, 여기서는 그 장 번호를 가리킨다. 둘이 어긋나면 ARCHITECTURE.md를 고치고 이 문서의 진행 로그에 남긴다.

---

## 0. 세션 프로토콜 (매 세션 시작 시)

1. `CLAUDE.md` → 이 문서 **§9 진행 로그의 마지막 항목** → 거기 적힌 "다음 Step"을 읽는다. PRD·ARCHITECTURE는 해당 Step이 가리키는 장만 읽는다.
2. **Step이 작업 단위**다. Step = 산출 파일 + 검증 + 커밋 1개(가끔 2개). Step 중간에 세션이 끊기면 진행 로그에 "S1.2 진행 중: 남은 것 …"으로 남긴다.
3. Step을 끝내면 체크박스를 `[x]`로 바꾸고 §9에 한 줄 추가한 뒤 커밋한다.
4. 계획과 다르게 구현했으면 해당 Step 아래 `> 변경(날짜):` 줄을 남긴다. 계획을 조용히 바꾸지 않는다.
5. **파일을 쓰기 전에 존재 여부를 확인한다.** 이 폴더를 다른 세션이 동시에 쓴 적이 있다(2026-09-02 PRD 덮어쓰기 사고). `cat >`·Write 전에 `ls`.
6. 커밋 규칙: Conventional Commits(`feat(tasks): …`, `chore:`, `docs:`), 본문은 한국어 가능. 트레일러:
   ```
   Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_013jAZ6FLsKCZE1gp4Tx5fYQ
   ```
   (세션 URL은 그 세션의 것으로 바꾼다.) 커밋 후 `git push origin main`.
7. 비밀은 `.env.local`에만. `.env.example`은 키 이름만. 커밋 전 `git diff --cached --name-only | grep -i env` 확인.
8. API 이름은 구현 시점에 재확인한다: AI SDK는 `node_modules/ai/docs/`, Supabase는 `https://supabase.com/docs/…​.md`, Meta는 `https://dev.meta.ai/docs/speech-to-text/`.

---

## 1. 확정 결정 (Decision Log)

| # | 결정 | 근거·메모 |
|---|---|---|
| D1 | 기준 문서 = `docs/PRD.md` v1.0 | 사용자 답변 1 |
| D2 | 로그인 = Supabase Auth Google만. 허용 이메일 1개(`ALLOWED_GOOGLE_EMAIL`)로 잠금 | 답변 2·5. 공개 URL이므로 다른 구글 계정의 로그인을 콜백에서 거부 |
| D3 | 오디오 = 보관. v1은 기기 IndexedDB(압축 녹음 영구 + PCM 세그먼트 임시). 서버 무저장 | 답변 3. Storage 업로드는 v1.5(§5 P6 S6.5) |
| D4 | 전사 = Meta `muse-voice-transcribe-1.0` 배치, 2패스(라이브 ENDPOINTING 8~20초 세그먼트 → 파이널 DIARIZATION 9.5분 청크·30초 겹침·스티칭) | 답변 4. 한도 10분·32MB. ARCHITECTURE 7장 |
| D5 | 단일 사용자. RLS는 유지(안전망), 공유 UI 없음 | 답변 5 |
| D6 | 말투 = 친근한 존댓말(해요체). 호칭 기본 "빈센트님", 설정에서 변경 | 답변 6 |
| D7 | 예산 상한 없음(선택). 대신 모든 AI 호출을 단가표로 환산해 원장에 기록하고 대시보드·응답 옆에 표시 | 답변 7 |
| D8 | 개인 Gmail → Google Cloud OAuth 동의 화면 "프로덕션(미검증)" 게시 | 답변 8. 테스트 상태는 7일 토큰 만료 |
| D9 | GitHub `srcho/rachel`, 의미 단위 커밋, `main` 직접 커밋(솔로) | 사용자 지시 |
| D10 | Muse 실시간 WebSocket은 v1 제외(키 노출·60분·페이싱 제약). v2 relay 스파이크 | ARCHITECTURE 7.7 |
| D11 | DB 접근 = supabase-js + 생성 타입(ORM 없음) | ARCHITECTURE 1장 |
| D12 | 임베딩 = `text-embedding-3-small` 1536d | ARCHITECTURE 1장 |
| D13 | **로컬 전사 옵션(2026-09-03)**: 파이널 패스는 맥(M4 Max 64GB)에서 도는 워커가 Microsoft VibeVoice-ASR(9B, MIT, 한국어·화자·타임스탬프, 60분 단일 패스)로 처리하는 것을 1순위로 검토. 맥이 없으면 Muse 폴백. 라이브 패스는 Muse 유지. 스트리밍 변형은 MLX 포팅 후 검토 | S3.0 스파이크, S3.5, S6.5 앞당김 |

---

## 2. 전사 설계 요약 (Muse Voice Transcribe)

상세는 ARCHITECTURE 7장. 구현자가 외워야 할 숫자만 여기에.

| 항목 | 값 |
|---|---|
| 엔드포인트 | `POST https://api.meta.ai/v1/asr/transcribe?sessionId=<id>` · `Authorization: Bearer $META_MODEL_API_KEY` · multipart `request`(JSON) + `audio`(WAV) |
| 오디오 | WAV, mono, 16-bit PCM, 16 kHz(우리 기본) 또는 24 kHz |
| 한도 | 요청당 **10분 · 32 MB**. 16 kHz는 10분 = 19.2 MB, 24 kHz는 28.8 MB |
| 모드 | 라이브 패스 `ENDPOINTING` · 파이널 패스 `DIARIZATION` · 음성 입력 `PUSH_TO_TALK` |
| 바이어스 | `languageBias: ["Korean","English"]`, `keywords: [...]`(≤ 50개로 자체 제한) |
| 응답 | `{ sessionId, transcript, audioDurationMs, turns[{turnId,startMs,endMs,transcript,speaker}] }` |
| 가격 | $0.18/시간, 초 단위 내림. 실패·429 미과금 |
| 세그먼트 | 최소 8초 · 최대 20초 · 무음 600ms에서 컷 · 전체 무음이면 업로드 생략 |
| 청크 | 570초, 다음 청크는 540초부터(겹침 30초). 마지막 청크 < 60초면 앞에 합침(≤ 600초) |
| 스티칭 | 겹침 30초에서 turn 시간 겹침 행렬 → 그리디 매칭 → 전역 라벨 S1, S2… |
| 비용(60분) | 라이브 ≤ $0.18 + 파이널 ≤ $0.19 + 요약 ≈ $0.013 ≈ **$0.38** |

미확인 항목(§7 리스크): 배치 엔드포인트의 분당 요청 한도, `keywords` 최대 개수, 한국어 실제 품질. S3.0 스파이크에서 확인한다.

---

## 3. 환경 준비 체크리스트 (사람이 하는 일)

코드 작업 전에 끝낸다. 결과 값은 `.env.local`에.

- [ ] **도구**: Node 22(있음 v22.23.1) · pnpm 10(있음 10.32.1) · Docker Desktop(로컬 Supabase) · Supabase CLI(`brew install supabase/tap/supabase`) · Vercel CLI 최신(`pnpm add -g vercel@latest`)
- [ ] **Supabase 프로젝트** 생성(리전 `ap-northeast-2` 서울, Free). Dashboard → Settings → API에서 `Project URL`, `publishable key`, `secret key` 복사
- [ ] **Supabase Auth Google**: Dashboard → Authentication → Providers → Google 켜기. Google Cloud에서 웹 OAuth 클라이언트 만들고 리디렉션 URI에 `https://<ref>.supabase.co/auth/v1/callback` 등록. Client ID/Secret을 Supabase에 입력
- [ ] **Google Cloud 프로젝트**(rachel): Google Calendar API 활성화. OAuth 동의 화면: 외부 · 앱 이름 Rachel · 범위 `calendar.events`, `calendar.readonly` · **게시 상태 "프로덕션"**(미검증 경고는 "고급 → 이동"으로 통과). 캘린더 연동용 웹 클라이언트에 리디렉션 URI `http://localhost:3000/api/integrations/google/callback`과 프로덕션 URL 등록 → `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
- [ ] **OpenAI API 키** → `OPENAI_API_KEY`
- [ ] **Meta Model API 키**: https://dev.meta.ai 가입 → 키 발급 → `META_MODEL_API_KEY`
- [ ] **Vercel**: `vercel link`로 프로젝트 연결(Hobby). 환경변수는 `vercel env add`로 등록(§16 ARCHITECTURE 목록)
- [ ] **pg_cron·pg_net·vector·pg_trgm** 확장: Supabase Dashboard → Database → Extensions에서 켜기(마이그레이션에서도 `create extension if not exists`로 시도)
- [ ] **Vault 시크릿**(프로덕션 DB): `rachel_jobs_url` = `https://<vercel-domain>/api/jobs/run`, `rachel_cron_secret` = 랜덤 32바이트(= `CRON_SECRET`)

---

## 4. 코드 규약 요약

ARCHITECTURE 14장이 전체. 여기서는 매 Step에서 어기기 쉬운 것만.

- 모듈은 `src/modules/<id>/`에 닫힌다. 다른 모듈 import 금지(Biome `noRestrictedImports`로 `@/modules/*` 교차 참조 차단, 자기 모듈은 허용).
- DB 접근은 모듈의 `repository.ts`에서만. Server Action(`actions.ts`)과 도구(`tools.ts`)는 `service.ts`만 호출한다.
- 새 테이블 = 마이그레이션 + `core.enable_owner_rls('<table>')` + `(user_id, …)` 인덱스 + `supabase gen types`.
- 모든 AI 호출은 `core/llm/client.ts` 또는 `core/transcription/` 경유. 직접 `fetch`/SDK 호출 금지.
- 서버 컴포넌트 우선. `'use client'`는 인터랙션 컴포넌트에만.
- 문자열은 한국어 직접 작성(사전 분리는 P6 이후).

---

## 5. Phase별 Step

각 Step: **목표 → 산출 → 구현 세부 → 검증 → 커밋**. 체크박스는 완료 시 `[x]`.

### P0 Foundation (2~3일) — 목표: 로그인 → 빈 Today가 PWA로 설치되고, 더미 모듈이 nav·위젯·도구를 등록해 뜬다

#### S0.1 스캐폴드
- [x] 목표: Next.js 16 + TS strict + Tailwind v4 + shadcn + Biome 뼈대.
- 산출: `package.json`, `next.config.ts`, `tsconfig.json`(`@/*` → `src/*`, `strict`, `noUncheckedIndexedAccess`), `biome.json`, `src/app/layout.tsx`, `src/app/globals.css`, `components.json`, `.env.example`, `README.md` 갱신.
- 구현:
  ```bash
  pnpm create next-app@latest . --typescript --tailwind --app --src-dir --turbopack --import-alias "@/*" --biome --yes   # --biome 없으면 --no-eslint 후 pnpm add -D @biomejs/biome && pnpm biome init
  pnpm dlx shadcn@latest init            # style: default(new-york), base color: zinc, css variables: yes
  pnpm dlx shadcn@latest add button input textarea badge card sheet drawer dialog dropdown-menu popover command tabs tooltip separator scroll-area skeleton switch select sonner chart calendar
  pnpm add @supabase/supabase-js @supabase/ssr ai @ai-sdk/openai @ai-sdk/react zod @tanstack/react-query @tanstack/query-async-storage-persister @tanstack/react-query-persist-client idb-keyval idb zustand @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities fractional-indexing date-fns date-fns-tz chrono-node lucide-react next-themes serwist @serwist/next recharts react-hook-form @hookform/resolvers
  pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @playwright/test typescript supabase
  ```
  - `globals.css` 토큰: 밀도 컴팩트(`--radius: 0.5rem`, 기본 폰트 14px), 시스템 폰트 스택(`-apple-system, "Apple SD Gothic Neo", "Pretendard Variable", Pretendard, system-ui, sans-serif`), 라이트/다크 zinc.
  - `package.json` scripts: `dev`, `build`, `start`, `lint`(biome check), `format`, `typecheck`(tsc --noEmit), `test`(vitest), `test:e2e`(playwright), `db:types`(`supabase gen types typescript --local > src/core/db/types.generated.ts`), `db:reset`.
  - `.env.example`: ARCHITECTURE 16장 변수 전부, 값은 빈칸.
- 검증: `pnpm dev` → 기본 페이지. `pnpm typecheck && pnpm lint` 통과.
- 커밋: `chore: scaffold Next.js 16 app (Tailwind v4, shadcn, Biome)`
> 변경(2026-09-02): create-next-app은 비어 있지 않은 폴더를 거부해 임시 폴더에 생성 후 병합. shadcn CLI 옵션이 바뀌어 `init -y -d -b radix`(프리셋 radix-nova, base neutral)로 초기화하고 색은 globals.css에서 조정. AI SDK는 **v7**(`ai@7`)이 설치됨 — `reasoning` 옵션, `Output.object`, `usage.inputTokenDetails.cacheReadTokens` 확인 완료. shadcn 생성 컴포넌트는 biome 일부 규칙 예외.

#### S0.2 Supabase 로컬 + 코어 스키마
- [x] 목표: 로컬 Supabase가 뜨고 코어 테이블·RLS 헬퍼·타입이 생성된다.
- 산출: `supabase/config.toml`, `supabase/migrations/0001_core.sql`, `supabase/seed.sql`, `src/core/db/types.generated.ts`.
- 구현: `supabase init` → `supabase start`. `0001_core.sql` 내용(ARCHITECTURE 5.1·5.2):
  - `create extension if not exists vector, pg_trgm, pg_net, pg_cron;` (pg_cron은 로컬에서 실패해도 무시하도록 `do $$ begin … exception when others then null; end $$`).
  - `create schema if not exists core;`
  - `core.set_updated_at()` 트리거 함수, `core.enable_owner_rls(tbl regclass)` 함수(alter table enable RLS + select/insert/update/delete 4정책 생성, `(select auth.uid()) = user_id`).
  - 테이블: `profiles`(id = auth.users.id, display_name, timezone default 'Asia/Seoul', locale 'ko', settings jsonb default '{}'), `integrations`, `domain_events`, `jobs`, `llm_usage`, `undo_tokens` — 컬럼은 ARCHITECTURE 5.2 그대로. 각 테이블에 `select core.enable_owner_rls('public.<t>')`.
  - `auth.users` insert 트리거 → `profiles` 행 생성(`security definer`이지만 `auth` 스키마 트리거로 한정, 본문은 insert 하나).
  - 뷰 `v_llm_usage_monthly`, `v_llm_usage_by_feature`, `v_llm_usage_daily` (`with (security_invoker = true)`).
  - 인덱스: `jobs(status, run_at)`, `jobs(dedupe_key) where status='pending'` unique, `domain_events(user_id, occurred_at desc)`, `llm_usage(user_id, created_at desc)`, `llm_usage using gin(ref)`.
- 검증: `supabase db reset` 성공 → `pnpm db:types` 생성 → `supabase db advisors`(또는 MCP get_advisors) 경고 0.
- 커밋: `feat(core): Supabase local setup and core schema (profiles, jobs, events, llm_usage)`
> 변경(2026-09-02): 다른 프로젝트(hinomad_web)가 543xx 포트를 쓰고 있어 로컬 포트를 **553xx**로 변경(API 55321·DB 55322·Studio 55323). 마이그레이션 파일명은 `20260902000001_core.sql`. `enqueue_job`/`claim_jobs`를 RPC로 추가(부분 unique 인덱스는 PostgREST upsert가 못 쓰므로). advisors는 미실행(다음 세션에서 `supabase db advisors` 또는 MCP).

#### S0.3 인증 (Google만, 단일 계정 잠금)
- [x] 목표: Google로 로그인/로그아웃, 허용 이메일 외 거부, `(app)` 그룹 보호.
- 산출: `src/core/db/server.ts`(cookies 기반 `createServerClient`), `browser.ts`, `admin.ts`(secret key + `dbFor(userId)` 래퍼), `src/core/auth/session.ts`(`getClaims()` 래퍼 `requireUser()`), `src/proxy.ts`, `src/app/(auth)/login/page.tsx`, `src/app/auth/callback/route.ts`, `src/app/(app)/layout.tsx`(임시), 로그아웃 액션.
- 구현: `@supabase/ssr` 공식 Next.js 패턴(쿠키 get/set). 로그인 버튼 → `signInWithOAuth({provider:'google', options:{redirectTo:`${origin}/auth/callback`}})`. 콜백에서 `exchangeCodeForSession` 후 이메일이 `ALLOWED_GOOGLE_EMAIL`과 다르면 `signOut` + `/login?error=not-allowed`. `proxy.ts`는 `(app)` 경로에 세션 없으면 `/login`으로.
- 검증: 로컬에서 실제 Google 로그인(Supabase 로컬 Auth에 Google 자격 넣거나, 로컬은 이메일 매직링크로 대체하고 Google은 프로덕션 프로젝트로 확인). 다른 계정 거부 확인.
- 커밋: `feat(core): Google-only auth with single-account allowlist`
> 변경(2026-09-02): 코드만 작성·타입 검증. **실제 Google 로그인은 미검증**(Google OAuth 클라이언트 필요). `/login` 200, `/today` → `/login?next=` 리다이렉트 확인. `ALLOWED_GOOGLE_EMAIL`이 비어 있으면 로컬 편의로 모두 허용.

#### S0.4 모듈 계약 · 레지스트리 · 이벤트 · 잡
- [x] 목표: ARCHITECTURE 3장 계약이 코드로 존재하고, 더미 모듈이 등록되어 nav·위젯·도구·잡이 돈다.
- 산출: `src/core/contracts/{module,tool,event,job,widget,context,indexer,command}.ts`, `src/core/registry/{registry,tools,nav}.ts`, `src/core/events/bus.ts`, `src/core/jobs/{queue,runner}.ts`, `src/app/api/jobs/run/route.ts`, `src/modules/index.ts`, `src/modules/_hello/`(더미: manifest·widget·tool `hello.ping`·job `hello.echo`), 테스트 `src/core/registry/__tests__/registry.test.ts`, `src/core/jobs/__tests__/runner.test.ts`.
- 구현:
  - 계약 인터페이스는 ARCHITECTURE 3.2를 그대로 옮긴다(`ToolContext`, `AgentTool`, `DomainEvent`, `EventHandler`, `JobHandler`, `DashboardWidget`, `ContextProvider`, `Indexer`, `Command`, `SettingsSection`, `ServiceContext`).
  - `bus.emit()`: `domain_events` insert → `registry.eventHandlers(type)` 순차 실행(try/catch, console.error).
  - `queue.enqueue({type, payload, dedupeKey?, runAt?})`: `jobs` insert(dedupe는 partial unique 충돌 시 무시) → `after(() => fetch(`${APP_URL}/api/jobs/run`, {headers:{'x-cron-secret'}}))`.
  - `runner.run()`: claim SQL(ARCHITECTURE 11장, `for update skip locked limit 10`) → 핸들러 `schema.parse(payload)` → `run(payload, ctx)` → done / failed(attempts++, `run_at = now() + 2^attempts 분`, `max_attempts` 초과 시 failed 고정). 10분 지난 running 회수.
  - `/api/jobs/run`: `x-cron-secret` 상수 시간 비교 → `runner.run()` → `{claimed, done, failed}`.
- 검증: vitest — 레지스트리가 도구 이름을 `<module>.<name>`으로 합치는지, 잡 러너가 실패 시 백오프 재스케줄하는지(로컬 Supabase 사용). `curl -H 'x-cron-secret: …' localhost:3000/api/jobs/run`로 `hello.echo` 잡 처리 확인.
- 커밋: `feat(core): module contracts, registry, event bus, job queue with cron runner`
> 변경(2026-09-02): 레지스트리 인스턴스는 `src/modules/index.ts`에서 생성하고 코어(runner·bus)는 주입받는다. 잡 러너는 `JobStore` 인터페이스(Supabase 어댑터 + 테스트용 인메모리). `dbFor(userId)` 강제 래퍼 대신 **규약**(service-role 경로의 리포지토리는 `.eq('user_id', ctx.userId)` 필수). 스모크: enqueue_job → /api/jobs/run → done, 이벤트 핸들러 실행 확인.

#### S0.5 LLM 코어 · 단가표 · 원장
- [x] 목표: 모든 AI 호출이 한 곳을 지나며 비용이 원장에 남는다.
- 산출: `src/core/llm/{models,pricing,client,usage,budget}.ts`, `src/core/llm/prompts/persona.ts`, `src/core/transcription/{provider,muse,openai,wav}.ts`, 테스트 `pricing.test.ts`, `wav.test.ts`, `muse.test.ts`(fetch 모킹).
- 구현:
  - `models.ts`: ARCHITECTURE 6.1의 역할 맵. reasoning effort는 `providerOptions.openai.reasoningEffort`(AI SDK 옵션명은 `node_modules/@ai-sdk/openai/docs`에서 확인).
  - `pricing.ts`:
    ```ts
    export const PRICING = {
      'openai/gpt-5.6-luna':            { per: 1_000_000, input: 0.20, cachedInput: 0.02, output: 1.20 },
      'openai/text-embedding-3-small':  { per: 1_000_000, input: 0.02 },
      'meta/muse-voice-transcribe-1.0': { audioHour: 0.18 },
    } as const;
    export function costOfTokens(modelKey, u: {input, cached, output}): number
    export function costOfAudio(modelKey, seconds: number): number   // floor(seconds) / 3600 * audioHour
    ```
  - `client.ts`: `llm.generate({ role, feature, ref, prompt|messages, output?, tools? })`와 `llm.stream(...)`. 내부에서 AI SDK `generateText`/`streamText` 호출, `onFinish`/결과의 `usage`(입력·캐시·출력 토큰 필드명은 AI SDK 문서 확인)를 `usage.record()`로 `llm_usage`에 기록(`unit_prices`에 단가 스냅샷, `latency_ms`). `embed()`도 동일.
  - `budget.ts`: `LLM_MONTHLY_BUDGET_USD` 있으면 월 누적과 비교해 `{ratio, level:'ok'|'warn'|'over'}` 반환. 없으면 항상 ok.
  - `transcription/provider.ts`: `interface TranscriptionProvider { transcribeFile(opts: {mode, languageBias, keywords, feature, ref}, wav: Blob): Promise<{ turns: Turn[], transcript: string, durationMs: number }> }`.
  - `muse.ts`: `fetch('https://api.meta.ai/v1/asr/transcribe?sessionId=' + id, { method:'POST', headers:{Authorization}, body: FormData(request JSON Blob + audio) })`. 429/5xx는 지수 백오프 2회. 응답 `audioDurationMs` → `usage.record({provider:'meta', model, feature, audio_seconds: floor(ms/1000)})`.
  - `wav.ts`: `encodeWav(pcm: Int16Array, sampleRate)`, `parseWavHeader(buf)`(서버에서 길이·포맷 검증: mono, 16-bit, ≤ 600초, ≤ 32MB).
- 검증: 단가 테스트(luna 2K 입력+3K 캐시+400 출력 = $0.00094 ± 1e-6), WAV 왕복 테스트, Muse 모킹 테스트. 실키로 `scripts/smoke-muse.ts`(10초 WAV) 1회 실행해 응답 스키마 확인 → `docs/spikes/muse-smoke.md`에 기록.
- 커밋: `feat(core): LLM client with pricing ledger, Muse transcription provider`
> 변경(2026-09-02): 모킹 테스트까지 완료. **실키 스모크(`scripts/smoke-muse.ts`)는 키 발급 후** 실행. `client.ts`는 AI SDK v7 규격(`instructions`, `reasoning`, `Output.object`).

#### S0.6 앱 셸 · 테마 · PWA
- [x] 목표: 모바일 하단 탭 + FAB 자리, 데스크톱 레일, 다크 모드, 설치 가능한 PWA, 오프라인 셸.
- 산출: `src/core/ui/{AppShell,MobileTabs,DesktopRail,ThemeProvider,Toaster,PageHeader}.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/today/page.tsx`(레지스트리 위젯 렌더, 더미 위젯 표시), `src/app/manifest.ts`, `src/app/sw.ts`, `src/app/~offline/page.tsx`, `public/icons/*`(192·512·maskable), `next.config.ts`에 `@serwist/next` 연결.
- 구현: nav는 `registry.nav()`. 세이프에어리어(`env(safe-area-inset-bottom)`), `viewport-fit=cover`, `theme-color` 라이트/다크. Serwist `defaultCache` + 런타임 규칙(ARCHITECTURE 10장). 개발 중 SW는 `NODE_ENV==='production'`에서만.
- 검증: `pnpm build && pnpm start` → Lighthouse PWA 설치 가능, 오프라인에서 `/~offline` 표시. iPhone Safari에서 홈 화면 추가 후 standalone 확인.
- 커밋: `feat(core): app shell, theme, PWA (Serwist)`
> 변경(2026-09-02): `@serwist/next`의 webpack 플러그인 모드는 Turbopack 미지원 → **configurator 모드**(`serwist.config.js` + `@serwist/cli`, `build = next build && serwist build`, `SerwistProvider`는 프로덕션에서만). 아이콘은 `scripts/gen-icons.mjs`가 만든 임시 PNG(교체 필요). `pnpm build` 성공, sw.js 생성 확인. Lighthouse·iPhone 설치는 배포 후 확인.

#### S0.7 배포 · 크론 연결
- [x] 목표: Vercel 프로덕션 URL에서 로그인·Today가 뜨고 pg_cron이 잡 러너를 호출한다.
- 산출: `vercel.json`(framework nextjs, 보안 헤더; 처음엔 `vercel.ts` 였으나 Git 배포가 설정을 못 읽어 2026-09-03 json 으로 교체), `supabase/cron.sql`(프로덕션에 수동 적용, ARCHITECTURE 11장 스케줄 5개 중 `rachel-jobs`만 먼저), 프로덕션 마이그레이션 적용(`supabase link` → `supabase db push`).
- 검증: 프로덕션에서 로그인, `jobs`에 `hello.echo` 넣고 1분 내 done. Vercel 로그에 `/api/jobs/run` 호출 확인.
- 커밋: `chore: Vercel config and production cron wiring`
> 변경(2026-09-03): 프로덕션 URL **https://rachel-seven-tau.vercel.app**(Vercel 프로젝트 `rachel`, 리전 icn1). Supabase `rachel`(ref `lpieoftpmhvxibhkhayn`, 서울). DB 비밀번호 없이 `supabase db query --linked -f`로 마이그레이션 적용 후 `migration repair`(이후 스키마 변경도 같은 방식 또는 `db push -p`). Auth 설정은 `config.toml` + `supabase config push`. Vault 시크릿 2개 + `cron.sql`로 rachel-jobs 등록 → pg_cron→Vercel→잡 done 확인. Google 로그인 실제 플로우는 사용자 확인 필요(Google 클라이언트 리디렉션 URI에 `https://lpieoftpmhvxibhkhayn.supabase.co/auth/v1/callback` 등록).

**P0 Exit**: 위 7개 Step 완료 + 더미 모듈 제거 전 스크린샷을 `docs/spikes/p0-exit.md`에. `_hello` 모듈은 P1 시작 때 삭제.

---

### P1 Tasks + Rachel v0 (5~7일) — 목표: S3 시나리오 통과, 매일 쓰기 시작

#### S1.1 tasks 스키마·리포지토리·서비스
- [x] 산출: `supabase/migrations/0002_tasks.sql`(boards, board_columns, cards — ARCHITECTURE 5.3), `src/modules/tasks/{schema,repository,service}.ts`, `src/modules/tasks/__tests__/service.test.ts`.
- 구현: `service.ensureDefaultBoard(userId)`(없으면 "Personal" + 4컬럼, `is_done` = Done), `createCard`, `moveCard(cardId, columnId, beforeId?, afterId?)` → `fractional-indexing`의 `generateKeyBetween`, `completeCard`(Done 컬럼 이동 + `completed_at`), `archive`, `bulkUpdate`. 모든 변경은 `emit('task.<event>')`. 자연어 마감: `chrono-node` ko 로케일(`chrono.ko.parseDate`) 우선.
- 검증: 서비스 단위 테스트(로컬 Supabase): 이동 시 1행만 갱신, Done 이동 시 completed_at 세팅, 다른 user_id로 0행(RLS).
- 커밋: `feat(tasks): schema, repository, service with fractional ordering`
> 변경(2026-09-03): 자연어 마감 파싱은 서비스가 아니라 UI(QuickAdd)·도구 계층에서 처리(서비스는 ISO만). 통합 테스트 헬퍼 `src/test/supabase.ts`(로컬 사용자 생성·RLS 세션)는 로컬 Supabase가 없으면 skip. 타임존 하루 경계는 `core/utils/date.ts`. 프로덕션에도 적용됨(0002).

#### S1.2 칸반 UI
- [x] 산출: `src/app/(app)/tasks/page.tsx`(기본 보드로 redirect), `tasks/[boardId]/page.tsx`(RSC: 보드+컬럼+카드 로드), `src/modules/tasks/ui/{Board,Column,Card,CardSheet,QuickAdd,LabelPicker,DuePicker}.tsx`, `src/modules/tasks/queries.ts`(TanStack Query 키·훅·낙관적 업데이트), `src/core/realtime/useTableChanges.ts`, `src/core/query/{provider,persister}.tsx`.
- 구현: `@dnd-kit/sortable` 컬럼 내·간 이동, 터치 센서(롱프레스 150ms), 키보드 센서. 낙관적 이동 → `actions.moveCard` → 실패 시 롤백 + sonner 토스트. Realtime: `postgres_changes` on `cards` filter `user_id=eq.<id>` → 쿼리 무효화. 모바일 컬럼 가로 스크롤 + `scroll-snap`. 카드: 제목 2줄, 우선순위 점, 마감 상대 표기, 라벨 칩. `CardSheet`: 모바일 Drawer / 데스크톱 Sheet, 설명 markdown(간단 렌더러는 `react-markdown` 지연 로드 또는 P6).
- 검증: 카드 100장 시드로 스크롤 성능, 이동 100ms 반영(Performance 탭), 두 브라우저에서 Realtime 반영.
- 커밋: `feat(tasks): kanban board UI with drag-and-drop, optimistic updates, realtime`
> 변경(2026-09-03): TanStack Query 대신 **RSC 초기 데이터 + 클라이언트 낙관적 상태 + Server Action + Realtime→router.refresh()**(진행 중 조작이 있으면 서버 반영 보류). 오프라인 읽기는 Serwist 페이지 캐시로 충족. chrono-node에 한국어 로케일이 없어 `parse-due.ts`에 자체 규칙 파서(오늘·내일·모레·N일 후·다음주 X요일·M/D·M월 D일·오후 N시 등) + 영어 폴백. 0003 마이그레이션으로 cards·board_columns Realtime 발행. 브라우저 실측(스크롤·Realtime)은 배포 후 사용자 확인.

#### S1.3 tasks 액션·도구·위젯
- [x] 산출: `src/modules/tasks/{actions,tools,widgets,events,indexer,module}.ts`, `src/modules/index.ts`에 등록(`_hello` 제거).
- 구현: 도구 `list(filter: {board?, column?, due?: 'today'|'overdue'|'week', label?, q?})`, `get`, `create`, `update`, `move`, `complete`(write + undo), `delete`(destructive), `bulkUpdate`(write, 5건 초과 시 destructive 승격), `boards.list`. `undo`는 이전 값 스냅샷으로 복원. 위젯 `DueTodayWidget`(today), `ThroughputWidget`(insights, P5에 채움). `contextProvider`: 마감·지연 카드 ≤ 10, 예산 600토큰.
- 검증: 도구 스키마 테스트, `list` 필터 테스트.
- 커밋: `feat(tasks): agent tools, server actions, today widget`
> 변경(2026-09-03): 도구는 `defineTool()` 헬퍼로 입력·출력 타입 추론. `bulkUpdate`는 항상 destructive(승인). undo 는 출력에 `_before` 스냅샷을 실어 구현. `_hello` 모듈 삭제, Today·설정 nav 는 코어(app 레이아웃)에서 고정. 인덱서는 S4.2 에서.

#### S1.4 agent 모듈 — 채팅 Dock과 도구 루프
- [x] 산출: `supabase/migrations/0003_agent.sql`(chat_threads, chat_messages), `src/modules/agent/{module,schema,repository,service,context,persona,tools}.ts`, `src/app/api/chat/route.ts`, `src/modules/agent/dock/{RachelDock,Fab,MessageList,Message,ToolCard,ApprovalCard,Composer,ContextChip,CostChip,ThreadList}.tsx`, `src/modules/agent/store.ts`(zustand: open, mode, threadId, uiContext).
- 구현:
  - `/api/chat`: ARCHITECTURE 6.1 흐름. `ToolLoopAgent`(AI SDK v6; 생성자·`stream` 메서드명은 `node_modules/ai/docs` 확인) + `toAiSdkTools(registry.tools(), ctx)` + `stopWhen: stepCountIs(6)`. `needsApproval`로 destructive 승인. 응답은 UI 메시지 스트림. `onFinish`에 메시지 저장·`llm_usage`(ref {thread})·`enqueue('memory.extract', dedupe: threadId, runAt: +10m)`.
  - 컨텍스트: `registry.contextProviders()` 병렬 → 예산 합 ≤ 6K(`core/utils/tokens.ts` 근사: 한글 1자 ≈ 1토큰, 영문 4자 ≈ 1토큰). 고정 접두어(persona + 도구 안내)와 동적 꼬리 분리.
  - persona.ts: 해요체·"빈센트님"(profiles.settings.honorific), 결과 먼저·3문장, 출처 표기, 파괴적 작업은 요약 후 승인.
  - Dock: 모바일 FAB(하단 중앙) → `Drawer`(snap 50%/95%), 데스크톱 우측 패널(`Sheet` 대신 레이아웃 컬럼, 너비 360~520 드래그, 고정 토글), ⌘J. 라우팅 간 유지( `(app)/layout.tsx`에 마운트). `useChat<RachelUIMessage>`(`InferAgentUIMessage`)로 타입 안전 파트 렌더: `tool-tasks.create` 등은 모듈 `Render` 또는 기본 `ToolCard`. `ApprovalCard`: 승인/거절(`addToolApprovalResponse` — 이름 확인). `CostChip`: 응답 아래 "3.1K tok · $0.0012"(`llm_usage` ref로 조회, 스트림 종료 후 표시).
  - 스레드: 최근 스레드 이어가기, 새 대화, 목록. 압축: 메시지 40개 초과 시 앞 20개를 luna로 요약해 `chat_threads.summary`.
- 검증: "Doing에서 마감 지난 것 보여줘" → 목록. "이 보드에서 마감 지난 것 다 다음 주 월요일로" → 승인 카드 → 실행 → 되돌리기. 첫 토큰 ≤ 1.5s 측정. 비용 칩 표시.
- 커밋: `feat(agent): Rachel chat dock with tool loop, approvals, undo, cost chip` (UI와 API를 2커밋으로 나눠도 됨)
> 변경(2026-09-03): AI SDK v7 규격 — `ToolLoopAgent` + `toolApproval`(destructive → 'user-approval') + `createAgentUIStreamResponse`(onStepFinish 로 사용량 합산, messageMetadata 로 비용 칩, onFinish 로 저장·원장). **OpenAI 도구 이름은 `^[a-zA-Z0-9_-]+$`** 라 레지스트리 `tasks.create` 를 어댑터가 `tasks_create` 로 노출(undo 토큰엔 레지스트리 이름). 실제 luna 통합 테스트(`agent.integration.test.ts`, 키 있을 때만) 통과. 스레드 압축(요약)·메시지 40개 초과 처리는 미구현 → S1.5/P4. 첫 토큰 시간·모바일 실측은 사용자 확인. 테스트 실행 시 키가 필요하면 `set -a; . ./.env.local; set +a; pnpm test`.

#### S1.5 memory 기본(추출·회상, UI는 P4)
- [x] 산출: `supabase/migrations/0004_memory.sql`(memories, search_chunks, HNSW·trgm 인덱스, RPC `match_memories`, `search_chunks_hybrid`), `src/modules/memory/{module,schema,repository,service,extract,retrieve,tools,jobs,events}.ts`, `src/core/llm/prompts/memory-extract.ts`.
- 구현: ARCHITECTURE 6.3. `memory.extract` 잡(스레드·회의 소스), 유사도 ≥ 0.92 병합, `recall` 컨텍스트 프로바이더(top-8 + pinned, 예산 1,200토큰, 사용 시 `use_count++`), 도구 `remember`, `recall`, `update`, `forget`(destructive).
- 검증: 대화에 "나는 아침형이야" → 10분 후(테스트에선 즉시 실행) `memories`에 preference 생성 → 새 대화에서 회상.
- 커밋: `feat(memory): memories schema, extraction job, recall context provider`
> 변경(2026-09-03): `search_path=''` 함수에서 pgvector 연산자는 `operator(extensions.<=>)` 로 써야 한다(로컬·프로덕션 모두 적용). 추출 트리거는 chat 라우트가 아니라 memory 모듈의 `chat.turn_completed` 이벤트 핸들러가 `memory.extract` 잡을 10분 뒤로 dedupe 등록(모듈 간 결합 없음). 회의 추출은 P3 에서 요약 텍스트 전달. 서비스 테스트는 결정적 가짜 임베딩으로 병합·회상·고정·삭제 검증. 실제 추출 품질은 실사용에서 확인(기억 화면은 S4.1).

#### S1.6 사용량 화면(설정)
- [x] 산출: `src/app/(app)/settings/page.tsx`(레지스트리 `settings()` 섹션 + 프로필·테마·호칭), `src/modules/insights/ui/UsagePanel.tsx`(임시로 settings에), `src/core/ui/CostChip.tsx`(공용).
- 구현: `v_llm_usage_monthly`·`by_feature` 조회 → 표(이번 달 합계, 기능별, 모델별) + 일별 미니 차트. 예산 설정 입력(선택).
- 검증: 채팅 몇 번 후 합계가 원장과 일치.
- 커밋: `feat(core): usage and cost panel in settings`
> 변경(2026-09-03): 사용량 패널은 `core/ui/UsagePanel.tsx`(뷰 3개, 차트 라이브러리 없이 막대), 예산은 `profiles.settings.monthlyBudgetUsd`(env 폴백), 호칭 설정 폼 추가(`core/settings/`). S5.2 에서 Insights 로 확장.

**P1 Exit**: PRD S3 통과. 프로덕션 배포. 여기서부터 매일 사용.

---

### P2 Calendar + Today (4~5일) — 목표: S1 통과, Google ↔ 앱 양방향

#### S2.1 Google 연동(OAuth 분리) · 캘린더 선택
- [x] 산출: `supabase/migrations/0005_calendar.sql`(calendars, calendar_events), `src/app/api/integrations/google/{start,callback}/route.ts`, `src/modules/calendar/{module,schema,repository,service,google,sync}.ts`, 설정 섹션 `CalendarSettings.tsx`(연결·캘린더 선택·마지막 동기화·재연결).
- 구현: `google-auth-library` 또는 직접 OAuth2(토큰 교환은 `fetch`로 충분). refresh token → `vault.create_secret`(RPC는 service role로, `integrations.vault_secret_id`). 액세스 토큰은 메모리 캐시(만료 5분 전 갱신). `google.ts`: `listCalendars`, `listEvents({calendarId, syncToken|timeMin,timeMax, singleEvents:true})`, `insert/patch/delete` (etag `If-Match`).
- 검증: 연결 → 캘린더 목록 → 선택 저장. 토큰 회수 후 재연결 안내.
- 커밋: `feat(calendar): Google OAuth integration with Vault-stored refresh token`
> 변경(2026-09-03): googleapis 없이 fetch 클라이언트. Vault 접근은 `public.integration_secret_set/get/delete`(security definer, `core.assert_owner`로 소유자·service_role 검사). **실제 OAuth 연결은 사용자 확인 필요**(설정 > 연결).

#### S2.2 증분 동기화
- [x] 산출: `sync.ts`(ARCHITECTURE 8.2), 잡 `calendar.sync`, `supabase/cron.sql`에 15분 스케줄 추가, 앱 열 때 트리거(`(app)/layout.tsx`에서 마지막 동기화 5분 경과 시 `enqueue` dedupe).
- 검증: Google에서 일정 생성·수정·삭제 → 15분 내(수동 킥 시 즉시) 미러 반영. 410 시 전체 재동기화 테스트(sync_token 손상 시뮬레이션).
- 커밋: `feat(calendar): incremental sync job with syncToken and full-resync fallback`
> 변경(2026-09-03): pg_cron `rachel-calendar-sync`(15분, 연결된 사용자별 enqueue_job) 프로덕션 등록. 앱 열 때 트리거는 `(app)/layout` → `calendar/trigger.ts`(인스턴스당 1분 1회 확인). 실기기 검증(Google→앱 반영 시간) 대기.

#### S2.3 캘린더 UI · CRUD(write-through)
- [x] 산출: `src/app/(app)/calendar/page.tsx`, `src/modules/calendar/ui/{Agenda,WeekView,MonthView,EventSheet,NowLine}.tsx`, `actions.ts`.
- 구현: 아젠다(모바일 기본, sticky 날짜 헤더, 현재 시각 라인), 주간(데스크톱), 월간. 생성·수정·삭제는 로컬 즉시 반영 → Google 반영 → 실패 시 `pending_push` 배지 + 재시도 잡.
- 검증: 앱에서 생성 → 5초 내 Google 표시. 오프라인 생성 → 온라인 복귀 후 반영.
- 커밋: `feat(calendar): agenda/week/month views and write-through CRUD`
> 변경(2026-09-03): 주간 뷰는 시간 격자 대신 7열 시간순 목록(데스크톱·모바일 공용, 경량). 뷰·날짜는 searchParams. 일정 편집은 시트 폼(포커스 저장 아님, 저장 버튼).

#### S2.4 calendar 도구
- [x] 산출: `tools.ts`(listEvents, getEvent, createEvent, updateEvent, deleteEvent(destructive), findFreeSlots), 컨텍스트 프로바이더(오늘·내일 ≤ 10, 예산 800토큰).
- 구현: `findFreeSlots(range, durationMin, workHours 09–19 기본)` — SQL로 빈 구간 계산(LLM 아님).
- 검증: "내일 오후 비는 시간에 리뷰 잡아줘" → 2스텝 성공.
- 커밋: `feat(calendar): agent tools including findFreeSlots`

#### S2.5 insights 뼈대 · Today 화면 · 일일 브리핑
- [x] 산출: `supabase/migrations/0006_insights.sql`(insights 테이블), `src/modules/insights/{module,repository,service,jobs,widgets}.tsx`, `src/app/(app)/today/page.tsx` 완성, `src/core/llm/prompts/daily-brief.ts`, cron `rachel-daily-brief`.
- 구현: Today = `registry.widgets('today')` 그리드(브리핑 카드, 오늘 타임라인(calendar), 마감·지연(tasks), 최근 회의(P3에서 등장), 캡처 입력(P4)). 브리핑: 첫 접속(05:00 이후) 또는 06:00 KST 잡 → luna 1회 → `insights(daily_brief)` 캐시. 카드에 CostChip.
- 검증: Today 첫 페인트 ≤ 1.5s(캐시), 브리핑 비용 ≤ $0.003.
- 커밋: `feat(insights): Today screen with cached daily brief`
> 변경(2026-09-03): 브리핑은 레이첼의 컨텍스트 프로바이더(일정·할 일·기억)를 재사용해 luna 1회(≤400 출력 토큰). 캐시 없으면 Today 카드가 첫 접속 때 1회 생성 요청, 06:00 KST 크론 `rachel-daily-brief` 도 등록. 캡처 입력은 P4.

**P2 Exit**: PRD S1 통과.

---

### P3 Meetings (7~9일) — 목표: S2 통과, 60분 회의 ≤ $0.40, 첫 요약 2분

#### S3.0 스파이크(최대 2일) — 코드 병합 없이 사실 확인
- [x] 산출: `docs/spikes/2026-09-meetings-spike.md`.
- 확인 항목:
  1. iPhone 설치형 PWA에서 `getUserMedia` + `AudioWorklet` + `MediaRecorder`(mp4) 동시 동작, 실제 sampleRate, 화면 켜둔 채 30분 녹음 안정성, 백그라운드 시 동작.
  2. Muse 배치: 실제 한국어 회의 10분 WAV(16k·24k 각각) → `ENDPOINTING`·`DIARIZATION` 응답, 체감 정확도, 처리 시간(실시간 대비 배율), 한·영 혼용 결과, `keywords` 효과, 분당 요청 한도(20초 세그먼트를 30개 연속 전송).
  3. IndexedDB에 115MB 저장·읽기 속도(iPhone), `storage.persist()` 결과.
  4. 60분 녹음의 청킹·업로드 총 소요(예상 3~7분) — G2는 라이브 전사 기준 요약으로 충족하므로 파이널은 백그라운드.
  5. **VibeVoice-ASR 로컬(맥 M4 Max 64GB)**: `mlx-community/VibeVoice-ASR-bf16`(비스트리밍 7B/9B)로 같은 30분 한국어 회의를 돌려 정확도·화자 일관성·처리 시간(실시간 배율)·메모리를 Muse 결과와 나란히 기록. 핫워드(키워드) 효과 확인. 스트리밍 변형(`VibeVoice-ASR-Streaming-7B`)은 MLX 포팅 여부만 확인.
- 결정: 품질 미달이면 `models.ts`의 `transcribe.provider`를 `'openai'`로 바꾸고 `openai.ts`를 구현(같은 인터페이스). VibeVoice가 Muse 이상이면 S3.5 파이널 패스를 **맥 워커 우선 + Muse 폴백**으로 설계 변경(아래 S3.5 변경 메모 참조).
- 커밋: `docs: meetings spike results (iOS recording, Muse quality)`
> 변경(2026-09-03): Muse 항목만 완료(`docs/spikes/2026-09-meetings-spike.md`): 한국어+영어 바이어스·키워드로 거의 완벽, 화자 A/B 정확, RTF≈0.18, OpenAI 전사보다 정확. **iOS 실기기·IndexedDB·분당 한도·VibeVoice 는 미확인**(코드 배포 후 사용자 실기기 테스트로 대체).

#### S3.1 meetings 스키마·서비스
- [x] 산출: `supabase/migrations/0007_meetings.sql`(meetings, transcript_segments — ARCHITECTURE 5.5), `src/modules/meetings/{module,schema,repository,service,hints}.ts`.
- 구현: `service.start({title?, calendarEventId?})`, `appendLiveTurns(meetingId, seq, turns)`, `finalize(meetingId)`(status processing, duration, `enqueue meetings.postprocess`, final_pass_status pending), `setSpeakerName`, `bookmark`. `hints.ts`: keywords 조립(참석자·사전·카드 제목) ≤ 50.
- 검증: 서비스 테스트(RLS 포함).
- 커밋: `feat(meetings): schema and service`

#### S3.2 녹음기(클라이언트)
- [x] 산출: `src/modules/meetings/recorder/{pcm-worklet.ts,AudioCapture.ts,Segmenter.ts,WavEncoder.ts,AudioStore.ts,Uploader.ts,MediaRecorderSink.ts,state.ts,useRecorder.ts}`, 테스트 `Segmenter.test.ts`(합성 PCM: 사인파 + 무음), `WavEncoder.test.ts`.
- 구현: ARCHITECTURE 7.1. 워클릿은 `public/worklets/pcm-capture.js`(AudioWorklet은 별도 파일 필요). 상태 머신은 zustand. 세그먼트 컷 → WAV → `AudioStore.putPcm` → `Uploader` 큐. `MediaRecorderSink`는 10초 timeslice 청크를 `AudioStore.appendRec`. Wake Lock·visibility·resume.
- 검증: 데스크톱 Chrome + iPhone Safari에서 5분 녹음 → 세그먼트 15~30개 생성, 무음 구간 생략 확인, 새로고침 후 이어 녹음.
- 커밋: `feat(meetings): browser recorder with PCM segmenter, WAV encoder, IndexedDB store`

#### S3.3 라이브 패스 라우트
- [x] 산출: `src/app/api/meetings/[id]/segments/route.ts`, `src/modules/meetings/live.ts`.
- 구현: ARCHITECTURE 7.2. WAV 검증(`parseWavHeader`) → `transcription.transcribeFile({mode:'ENDPOINTING', …})` → `appendLiveTurns` → 원장(feature `transcribe_live`, ref {meeting}) → 반환. 실패 시 `status='failed'` 세그먼트 행.
- 검증: 5분 녹음 → 화면 전사 지연 측정(목표 ≤ 30초), 원장에 초 단위 기록.
- 커밋: `feat(meetings): live-pass transcription route (Muse ENDPOINTING)`

#### S3.4 라이브 화면 · 목록 · 진입점
- [x] 산출: `src/app/(app)/meetings/page.tsx`(목록: 상태·길이·비용), `meetings/live/[id]/page.tsx`, `src/modules/meetings/ui/{LiveScreen,Timer,LevelMeter,LiveTranscript,BookmarkButton,EndDialog,MeetingListItem,StartMeetingButton}.tsx`, Today의 "녹음 시작" 위젯(임박 일정 ±10분).
- 구현: 큰 타이머 + 레벨 미터 + 흐르는 전사(자동 스크롤, 폰트 크기 조절) + 북마크 + 종료(확인 다이얼로그). 백그라운드 배너.
- 검증: S2 전반부(시작 → 전사 → 종료) 모바일에서.
- 커밋: `feat(meetings): live recording screen and meeting list`

#### S3.5 파이널 패스(청킹·화자 분리·스티칭)
- [x] 산출: `src/modules/meetings/finalpass/{chunker.ts,runner.ts,useFinalPass.ts}`, `src/app/api/meetings/[id]/diarize/route.ts`, `src/modules/meetings/stitch.ts`, 테스트 `chunker.test.ts`(경계·겹침·마지막 청크 병합), `stitch.test.ts`(합성 turn 3청크, 라벨 순열 뒤바꿈 케이스).
- 구현: ARCHITECTURE 7.3. 러너는 앱 시작 시 `final_pass_status in (pending, running)`인 회의를 찾아 이어서 실행. 진행률 UI(목록·상세). 완료 시 PCM 삭제, 실패 시 라이브 유지 + "다시 시도".
- 검증: 25분 녹음(3청크) → 화자 라벨이 청크 경계에서 이어지는지 수동 확인. 원장 `transcribe_final` 기록.
- 커밋: `feat(meetings): final-pass diarization with chunking and speaker stitching`
> 계획 변경 후보(2026-09-03, D13): 스파이크 결과가 좋으면 파이널 패스를 이렇게 바꾼다. (a) 종료 시 압축 녹음을 Supabase Storage `meeting-audio/<user>/<meeting>.webm|m4a`에 업로드(S6.5를 여기로 앞당김, 시간당 약 14MB). (b) 잡 `meetings.final_pass`를 큐에 넣고 **맥 워커**(`workers/mac-transcriber/`, Python + MLX, `TranscriptionProvider`와 같은 입출력)가 service-role 키로 잡을 집어가 오디오를 내려받아 60분 단일 패스로 전사 → `transcript_segments(pass='final')` 저장 → `meeting.transcribed` 이벤트. (c) 워커가 N분 안에 집어가지 않으면(맥 꺼짐) 서버 잡이 Muse 청크·스티칭 경로로 폴백. 클라이언트 청킹·스티칭 코드는 폴백용으로 유지. 워커 실행은 launchd로 로그인 시 자동 시작.

#### S3.6 후처리 잡 · 요약
- [x] 산출: `src/modules/meetings/postprocess.ts`, 잡 `meetings.postprocess`, `src/core/llm/prompts/meeting-summary.ts` + `MeetingSummarySchema`(zod), 이벤트 `meeting.summarized`, memory 모듈 핸들러·인덱서 연결.
- 구현: ARCHITECTURE 7.4. 라이브 기준 v1 즉시, 파이널 완료 시 v2(화자 반영, `summary_version`). 원장 feature `summarize`.
- 검증: 종료 → 2분 내 요약. 파이널 후 요약에 화자 이름 반영.
- 커밋: `feat(meetings): post-processing job with structured summary`

#### S3.7 회의 상세 · 리뷰 시트 · 재생 · 범위 RAG
- [x] 산출: `src/app/(app)/meetings/[id]/page.tsx`, `ui/{MeetingDetail,SummaryView,TranscriptView,SpeakerRename,ReviewSheet,AudioPlayer,CostBreakdown}.tsx`, `actions.ts`.
- 구현: 요약 탭 / 전사 탭(화자·타임스탬프, 탭하면 재생 위치 이동 — `AudioStore.getRec`로 Blob URL, 없으면 "이 기기에 오디오 없음"). 리뷰 시트: 액션 아이템 체크 → `registry.tools()['tasks.create']`를 서비스 경유로 일괄 생성(source meeting), 팔로업 → calendar. "이 회의에 대해 물어보기" → Dock을 `scope {meeting}`으로 열기(agent 컨텍스트 프로바이더가 요약 + 청크 top-5 주입). `CostBreakdown`: 라이브·파이널·요약 비용.
- 검증: S2 후반부(요약 → 액션 아이템 2탭 → 카드 생성). 비용 합계 ≤ $0.40(60분).
- 커밋: `feat(meetings): meeting detail with review sheet, playback, scoped chat`

#### S3.8 meetings 도구 · 검색 인덱서 · 위젯
- [x] 산출: `tools.ts`(list, get, search, summarize(force), createTasksFromActionItems, delete), `indexer.ts`(전사 300~500토큰 청크 + 요약), `widgets.tsx`(최근 회의 today, 회의 시간 insights).
- 커밋: `feat(meetings): agent tools, search indexer, widgets`
> 변경(2026-09-03): 도구 6개(list·get·search(ilike)·summarize·createTasksFromActionItems(undo)·delete). 벡터 인덱서는 S4.2 에서. 회의 컨텍스트 프로바이더(요약+전사 발췌)로 "이 회의에 대해 물어보기" 동작. 라이브 화면·파이널 패스·재생은 **아이폰 실기기 검증 필요**(PRD S2 수용 기준).

**P3 Exit**: PRD S2 통과 + 비용 기준. 스파이크 문서에 실측치 기록.

---

### P4 Memory · Search · Capture (3~4일) — 목표: S4·S6 통과

#### S4.1 기억 화면
- [x] 산출: `src/app/(app)/memory/page.tsx`, `src/modules/memory/ui/{MemoryList,MemoryItem,MemoryEditor,SourceLink}.tsx`, `actions.ts`.
- 구현: 유형 탭, 검색, 편집(재임베딩), 삭제, 고정, "왜 기억하나요?"(source 링크 → 회의·스레드로 이동).
- 커밋: `feat(memory): memory management screen`

#### S4.2 전역 검색 · ⌘K
- [x] 산출: `src/core/ui/CommandPalette.tsx`(레지스트리 commands + 검색), tasks·calendar·meetings·memory 인덱서 완성, `search.all` 도구, `src/modules/memory/search.ts`.
- 구현: 하이브리드 RPC(벡터 0.7 + trgm 0.3 + 최근성). 결과 유형별 그룹, Enter로 이동.
- 검증: "예산" 검색 → 회의 전사 청크·카드·기억이 섞여 나옴. S4 통과.
- 커밋: `feat(search): global hybrid search and command palette`
> 변경(2026-09-03): Command 계약을 데이터(href|action)로 바꿔 클라이언트 팔레트에 직렬화. 인덱싱은 memory 모듈이 소유(이벤트 `*` 구독 → `memory.index` 잡, 소스별 dedupe·15초 지연, 인덱서 청크 → 임베딩 upsert·잔여 삭제). 대량 재인덱싱(calendar.synced)은 미구현 — 프로덕션 기존 데이터는 SQL 로 1회 백필. 회의 검색 도구는 ilike, 전역 검색 도구 `memory.searchAll` 이 하이브리드.

#### S4.3 capture 모듈
- [x] 산출: `supabase/migrations/0008_capture.sql`, `src/modules/capture/{module,schema,repository,service,triage,tools,jobs,ui/}`, `src/app/(app)/capture/page.tsx`, `src/app/api/transcribe/quick/route.ts`, manifest `share_target`, Today 상단 입력, FAB 길게 누르기(음성 → quick 전사).
- 구현: `capture.triage` 잡(luna 구조화 출력: task/event/memory/note 제안) → 인박스 카드 → 1탭 확정(확정 전 데이터 변경 없음). Share Target은 GET `/capture?title&text&url`.
- 검증: 공유 시트로 URL 던지기(Android/데스크톱), 음성 캡처 → 제안 → 확정. S6 통과.
- 커밋: `feat(capture): quick capture inbox with triage and share target`
> 변경(2026-09-03): 음성 캡처는 FAB 길게 누르기(400ms) → 워클릿 PCM ≤60초 → `/api/transcribe/quick`(Muse PUSH_TO_TALK). 분류 확정은 레지스트리 도구(tasks.create·calendar.createEvent·memory.remember)로 실행. share_target 은 GET `/capture?title&text&url`(iOS 는 미지원, Android·데스크톱). 실기기 검증 필요: 길게 누르기 제스처·마이크 권한.

---

### P5 Insights · Notify (3~4일) — 목표: S5 통과, 대시보드 LLM 0회

#### S5.1 지표 뷰·위젯·차트
- [x] 산출: `supabase/migrations/0009_insights_views.sql`(`v_tasks_weekly`, `v_task_cycle_time`, `v_column_dwell`, `v_meetings_weekly`, `v_calendar_load_weekly`, `v_capture_conversion`, `v_streaks`), `src/modules/insights/metrics.ts`, 각 모듈 `widgets.tsx` 완성(shadcn charts), `src/app/(app)/insights/page.tsx`(기간 전환 주·월·분기, 위젯 그리드, 레이아웃 저장).
- 커밋: `feat(insights): metric views and dashboard widgets`

#### S5.2 AI 비용 대시보드
- [x] 산출: `src/modules/insights/ui/{CostOverview,CostByFeature,CostByModel,CostDaily,CostPerMeeting}.tsx`, 설정의 UsagePanel을 여기로 이동(설정에는 요약만).
- 구현: 월 누적·전월 대비, 기능별(채팅·전사 라이브·전사 파이널·요약·기억·브리핑·리뷰·임베딩), 모델별, 일별 추이, 회의당 평균, 예산 설정 시 진행 바. 모두 SQL 뷰.
- 검증: 원장 합계와 일치. LLM 호출 0.
- 커밋: `feat(insights): AI cost dashboard`

#### S5.3 주간 리뷰
- [x] 산출: 잡 `insights.weekly`, `src/core/llm/prompts/weekly-review.ts`, 규칙 탐지 `patterns.ts`, 리뷰 아카이브 UI, cron `rachel-weekly-review`.
- 커밋: `feat(insights): weekly review job with rule-based patterns`

#### S5.4 웹 푸시
- [x] 산출: `supabase/migrations/0010_notify.sql`(push_subscriptions), `src/modules/notify/`(module, service, jobs `notify.send`, 설정 섹션), `src/app/api/push/subscribe/route.ts`, `sw.ts`에 push 핸들러, VAPID 키.
- 구현: 알림 종류(회의 정리 완료·브리핑·마감 임박·주간 리뷰) on/off. 이벤트 핸들러로 `enqueue('notify.send')`.
- 검증: iPhone 설치형 PWA에서 회의 종료 후 푸시 수신.
- 커밋: `feat(notify): web push notifications`
> 변경(2026-09-03): 지표 뷰 7개(0012), 패턴 규칙 9종, 인사이트 위젯 6개(surface insights), 기간 4주/3개월/6개월. 주간 리뷰는 4주 지표+패턴 → luna 1회, 일요일 20:00 크론. 푸시: VAPID 키 생성(.env.local·Vercel), 구독은 설정 > 알림 "이 기기에서 켜기"(iOS 는 홈 화면 설치 후). 마감 임박(due_soon) 알림은 발송 규칙 미구현(P6 후보).

---

### P6 Hardening (3~4일) — 목표: 성능 예산 충족, RLS 테스트, 백업

#### S6.1 오프라인 쓰기 아웃박스(tasks 먼저)
- [x] `src/core/offline/outbox.ts`(IndexedDB 큐, 온라인 시 재생, 충돌 last-write-wins). 커밋 `feat(core): offline mutation outbox`.
#### S6.2 백업·내보내기
- [x] 잡 `core.backup`(주간 JSON.gz → Storage `backups`), `/api/export`. 커밋 `feat(core): weekly backup and full export`.
#### S6.3 테스트·CI
- [x] pgTAP RLS(`supabase/tests/rls.test.sql`), Playwright 스모크 4개(로그인·카드·채팅으로 카드·회의 시작/종료 — Muse는 라우트 인터셉트로 모킹), GitHub Actions(`typecheck`·`lint`·`test`). 커밋 `test: RLS, e2e smoke, CI`.
#### S6.4 성능 패스
- [x] 번들 예산 스크립트(Today ≤ 180KB gz), Lighthouse 모바일, Realtime 구독 범위 점검, 프롬프트 캐시 적중률 로그. 커밋 `perf: bundle budget and lighthouse pass`.
> 결과(2026-09-03): `pnpm check:bundle`(헤드리스 크로미움, 초기 HTML 의 `<script src>` gzip 합)이 라우트별 예산을 검사. 첫 측정은 테스트 로그인이 실패해 로그인 화면(208KB)을 재던 상태였고, 로그인 검증을 추가한 뒤 실측은 today 343 / tasks 473 KB 였다. 원인은 (1) memory·notify 상수를 zod 스키마 파일에서 가져와 zod 91KB 가 클라이언트에 실림, (2) `lucide-react/dynamic` 전체 인덱스 20KB, (3) supabase-js 50KB 가 Realtime 훅에 정적 import, (4) chrono-node 41KB 가 QuickAdd 에 정적 import. 상수 분리·정적 아이콘 맵·동적 import 로 today 201 / tasks 224 / calendar 207 / meetings 201 / insights 202 / memory 204 / capture 203 KB. 바닥값은 Next/React 런타임 132KB + 앱 셸 60KB 라 예산은 실측 +5~8%(today 215, tasks 240 …)로 재설정. 원인 추적은 `ANALYZE=1 pnpm build` 후 `pnpm analyze:bundle <chunk…>`(소스맵 집계). Lighthouse 모바일 수치는 사용자 실기기/PSI 확인 항목으로 남김. 프롬프트 캐시 적중률은 `llm_usage.cached_tokens` 로 이미 원장에 기록됨.
#### S6.5 (옵션) 오디오 Storage 업로드 · 실시간 relay 스파이크
- [ ] `SupabaseAudioStore` + 설정 토글 + 파이널 패스 서버 잡 전환; Muse Realtime relay 4.5분 로테이션 실험 → `docs/spikes/`.

---

## 6. 테스트 매트릭스 (요약)

| 대상 | 종류 | 언제 |
|---|---|---|
| pricing·wav·segmenter·chunker·stitch·fractional index | 단위(Vitest) | 해당 Step |
| service.ts(각 모듈)·repository·RPC·잡 러너 | 통합(로컬 Supabase) | 해당 Step |
| RLS 4정책 | pgTAP | S6.3(스키마 Step마다 최소 select/update 1개씩 추가) |
| 로그인·카드·채팅→카드·회의 시작/종료 | Playwright | S6.3 |
| Muse 프로바이더 | 모킹 단위 + 실키 스모크 스크립트 | S0.5, S3.0 |

## 7. 리스크·미결 (플랜 관점)

| # | 항목 | 확인 시점 | 대안 |
|---|---|---|---|
| 1 | Muse 배치 분당 요청 한도·`keywords` 최대 개수 미공개 | S3.0 | 세그먼트 최소 길이 늘리기(8→12초), 키워드 30개로 제한 |
| 2 | Muse 한국어 실제 품질 | S3.0 | `openai.ts` 프로바이더 |
| 3 | iOS AudioWorklet + MediaRecorder 동시 동작 | S3.0 | MediaRecorder 대신 PCM을 Opus로 인코딩(WebCodecs) 또는 압축 보관 포기(PCM 보관) |
| 4 | AI SDK v6 API 이름(ToolLoopAgent·needsApproval·usage 필드) | S1.4 | `node_modules/ai/docs` 기준으로 수정, 승인은 자체 confirm 스텝 |
| 5 | Vercel Hobby 함수 한도로 60분 회의 요약(≤ 120초) | S3.6 | 전사 청크 요약 → 병합(map-reduce) |
| 6 | 파이널 패스 총 소요(60분 회의 3~7분) | S3.5 | 청크 병렬 2, 24k 대신 16k 유지 |
| 7 | Supabase Free 7일 정지 | 운영 | 일일 브리핑 크론이 활동 생성 |
| 8 | VibeVoice-ASR 로컬: 출시 당일 모델, 스트리밍 변형 MLX 포팅 없음, 실시간 배율·발열 미측정 | S3.0 | 비스트리밍 파이널 패스부터. 맥 워커 미응답 시 Muse 폴백 |

## 8. 참고 링크

- Meta 전사 가이드: https://dev.meta.ai/docs/speech-to-text/ · 개요: https://dev.meta.ai/docs/overview/ · 쿡북: https://github.com/meta-models/meta-model-cookbook/tree/main/06_muse_voice/01_voice_api_fundamentals
- OpenAI luna: https://developers.openai.com/api/docs/models/gpt-5.6-luna
- AI SDK 문서(설치 후 로컬): `node_modules/ai/docs/`
- Supabase Next.js SSR: https://supabase.com/docs/guides/auth/server-side/nextjs.md
- Serwist Next: https://serwist.pages.dev/docs/next
- Google Calendar API sync: https://developers.google.com/calendar/api/guides/sync

## 9. 진행 로그

| 날짜 | 세션 | 완료 | 다음 | 메모 |
|---|---|---|---|---|
| 2026-09-02 | rachel-d5 | PRD v1.0 확정, ARCHITECTURE v1.0, PLAN v1.0 작성 | §3 환경 준비 → S0.1 | Muse 스펙 확인(10분·32MB, 한국어 포함, $0.18/h). 병렬 세션 PRD는 `docs/reference/`로 |
| 2026-09-02 | rachel-d5 | S0.1~S0.6 완료(키 없이 가능한 범위). 테스트 21개, `pnpm build` 성공, 잡 러너 스모크 통과 | **§3 키 발급(Supabase·Google·OpenAI·Meta·Vercel)** → S0.7 배포 → 실제 Google 로그인 검증 → P1 S1.1 | 로컬 Supabase 553xx 포트. `.env.local`에 로컬 Supabase 값은 채워짐, 나머지 키는 빈칸. 미검증: Google 로그인, Muse 실키, Lighthouse |
| 2026-09-03 | rachel-d5 | S0.7 완료: 프로덕션 DB 마이그레이션, Vercel 배포(rachel-seven-tau.vercel.app), env 10개, Auth 설정 push, pg_cron→잡 러너 동작 확인 | **P1 S1.1** tasks 스키마·서비스 | Meta 키만 미발급(Muse 실호출·S3.0 스파이크 대기). 사용자 확인 필요: Google 로그인 1회, Lighthouse/iPhone 설치 |
| 2026-09-03 | rachel-d5 | D13 결정: VibeVoice-ASR 로컬 파이널 패스(맥 워커 + Muse 폴백) 후보를 S3.0 스파이크·S3.5 변경 후보로 기록 | P1 S1.1 | 맥 M4 Max 64GB |
| 2026-09-03 | rachel-d5 | S1.1 완료: 0002_tasks(로컬·프로덕션), schema/repository/service, 통합 테스트 7개(총 30개) | **S1.2** 칸반 UI | — |
| 2026-09-03 | rachel-d5 | S1.2 완료: 칸반 UI(dnd-kit·낙관적 업데이트·Realtime), 카드 시트, 빠른 추가(한국어 마감 파서), /tasks 라우트, 배포 | **S1.3** tasks 도구·액션·위젯 | 테스트 36개. Google 로그인 사용자 확인 완료 |
| 2026-09-03 | rachel-d5 | S1.3 완료: tasks 도구 10개(undo 포함)·컨텍스트 프로바이더·Today 위젯·커맨드, 통합 테스트 | **S1.4** agent 모듈(채팅 Dock·도구 루프) | 테스트 38개 |
| 2026-09-03 | rachel-d5 | S1.4 완료: 0004_agent, /api/chat(ToolLoopAgent·승인·undo·비용 메타), Dock(FAB·드로어·패널·⌘J·스레드·컨텍스트 칩), 실제 LLM 테스트 통과, 배포 | **S1.5** memory 기본 | 테스트 43개 |
| 2026-09-03 | rachel-d5 | S1.5 완료: 0005_memory(pgvector·trgm·RPC 2개), memory 서비스(병합·회상·추출)·도구 5개·컨텍스트·추출 잡(스레드 유휴 10분) | **S1.6** 설정 사용량 화면 | 테스트 44개 |
| 2026-09-03 | rachel-d5 | S1.6 완료(사용량·비용 패널, 호칭·예산 설정). **P1 Exit**: 배포됨, S3 시나리오는 사용자 실사용 확인 필요 | **P2 S2.1** Google 캘린더 OAuth 연동 | 매일 사용 시작 가능 |
| 2026-09-03 | rachel-d5 | S2.1~S2.5 완료: OAuth(Vault)·증분 동기화·캘린더 3뷰·CRUD write-through·도구 6개·Today 브리핑. 0006·0007 프로덕션 적용, 크론 3개 | **P3 S3.0** 회의 스파이크(iOS 녹음·Muse·VibeVoice) — Meta 키 필요 | 사용자 확인: Google 연결·양방향 반영·브리핑 |
| 2026-09-03 | rachel-d5 | **버그 수정**: calendar 모듈 등록 누락·insights 모듈 배열 누락으로 프로덕션 잡 "핸들러 없음". 모듈 내부 `@/modules` 순환 import 제거(ctx.registry·getRegistry), 레지스트리 조립 회귀 테스트·biome 금지 규칙 추가. 재실행 결과 일정 30건 동기화·브리핑 생성 확인 | P3 S3.0 | 교훈: 파이썬 문자열 치환은 실패해도 조용하다 → 치환 후 assert, 조립 결과는 테스트로 검증 |
| 2026-09-03 | rachel-d5 | P3 S3.0(Muse)~S3.8 코드 완료·배포: 0008·0009, 녹음기(워클릿·세그먼터·IndexedDB), 라이브 패스, 라이브 화면, 파이널 패스(청킹·스티칭·diarize), 요약 v1/v2, 상세·리뷰 시트·재생, 도구 6개, 테스트 59개 | **사용자 실기기 검증**(iPhone PWA 녹음 → 전사 → 종료 → 요약 → 화자 분리) → P4 S4.1 | 미확인: iOS 동시 녹음, 분당 한도, VibeVoice |
| 2026-09-03 | rachel-d5 | 버그 수정: 대화 메시지 미저장(id text)·캘린더 "미연결" 오답(q 제거·connected 반환)·[지금] ISO 포함. P4 S4.1~S4.3 완료·배포: 기억 화면, 인덱서 4개·하이브리드 검색·⌘K, 캡처(입력·음성·공유·분류 인박스). 0010·0011, 테스트 63개, 프로덕션 인덱스 백필 | **P5 S5.1** 지표 뷰·위젯 (실기기 검증과 병행) | — |
| 2026-09-03 | rachel-d5 | P5 완료·배포: 지표 뷰(0012)·패턴·인사이트 대시보드·AI 비용·주간 리뷰(크론)·웹 푸시(0013, VAPID). 크론 4개 | **P6 S6.1** 오프라인 아웃박스 → S6.2 백업·내보내기 → S6.3 테스트·CI → S6.4 성능 | 사용자 확인: 설정 > 알림 켜기(아이폰은 설치 후), 인사이트 화면 |
| 2026-09-03 | rachel-d5 | **P6 완료**(S6.5 제외)·배포: S6.1 아웃박스(IndexedDB 재생, tasks Board), S6.2 백업 잡·전체 내보내기(0014, Storage `backups`), S6.3 pgTAP 9·Playwright 6·GitHub Actions, S6.4 번들 예산(today 343→201KB, tasks 473→224KB; zod·lucide 인덱스·supabase-js·chrono 첫 로드 제거) | **사용자 실기기 검증**(아이폰 녹음·음성 캡처·푸시·설치, Lighthouse) → 피드백 반영 → S6.5(옵션: 오디오 Storage·맥 워커) | 교훈: 측정 스크립트는 "로그인 성공" 같은 전제를 명시적으로 검증할 것(리다이렉트된 로그인 화면을 잰 채 최적화하고 있었음). e2e 1회 간헐 실패(원인 미상, 24회 재실행 통과) |
| 2026-09-03 | rachel-d5 | **UI 리디자인**·배포: Panel/Page/PageHeader 프레임, 4열·9rem 행 위젯 그리드(계약에 rows·placement·href·HeaderAction), Today 2×2 뷰포트 채움, 보드·캘린더 뷰포트 채움, 회의·기억·인박스·설정 Panel+Badge 통일, 레이첼 데스크톱 플로팅 창(⇧Space·⌘J·Esc). 스크린샷 스크립트 추가. E2E 6 통과, 번들 예산 통과(ARCHITECTURE §9b) | **사용자 실사용 피드백**(PC·아이폰) → 세부 다듬기 → S6.5(옵션) | 확인 부탁: ⇧Space 가 한/영 전환 등 OS 단축키와 충돌하지 않는지, 보드 4컬럼 최대폭(24rem)이 적당한지 |
| 2026-09-03 | rachel-d5 | Vercel Git 배포 오류 수정: `vercel.ts` 는 CLI 배포에서만 컴파일돼 GitHub 푸시 배포가 "couldn't load a valid project configuration" 으로 실패 → `vercel.json` 으로 교체, `@vercel/config` 제거. Today 그리드를 내용 높이(`rowsMode="auto"`)로 바꿔 불필요한 공백 제거 | 사용자 실사용 피드백 | 원칙: 뷰포트 채우기는 보드·캘린더처럼 화면 자체가 스크롤 대상일 때만 |
| 2026-09-03 | rachel-d5 | 할 일 ↔ Google 연동(ARCHITECTURE §9c)·배포: (1) 보드 상단 오늘 일정 스트립(드롭 시 카드 생성·연결) (2) Google Tasks 미러(0015 `google_task_links`, 스코프 tasks, 이벤트 기반 push/pull, 백필, 레이첼 도구 3개, 설정 토글). 칸반 드래그 고스트 폭·호버 수정, 캘린더 기본 월간. E2E 하이드레이션 원인(서버 "PM" vs 클라 "오후") 수정 → 12/12 통과. 통합 테스트 3개 추가 | **사용자**: Google Cloud 에서 Tasks API 켜기 → 설정에서 "권한 받기"(재동의) → 토글 켜기 → 구글 캘린더에서 확인 | 프로덕션 0015 적용됨 |
| 2026-09-04 | rachel-d5 | UI 피드백 반영·배포: 설정을 nav 에(모바일 탭 5개·레일 하단), 레이첼 FAB 우하단(모바일 탭 위), 카드·일정·리뷰 편집을 `FormDialog` 로(사이드 시트 제거, 컴팩트), 회의 녹음 화면 재구성(immersive: 탭·FAB 숨김, 큰 컨트롤, 종료 확인 다이얼로그, 실패 시 다시 시도/목록으로) + 녹음기 보강(iOS AudioContext resume, Safari pause/resume 예외 처리, 일시정지 시 컨텍스트 suspend, 백그라운드 복귀 시 resume, 중복 stop 방지) | **사용자 PWA 재검증**: 일시정지→재개→종료 흐름, 백그라운드 복귀 | 실제 iOS 동작은 실기기에서만 확인 가능 |
| 2026-09-04 | rachel-d5 | 보드 UX: 헤더 "카드 추가"(N) + NewCardDialog(제목·상태·마감/시각·우선순위·설명, 자연어 마감 제안), 컬럼 인라인 추가 제거, Done 은 오늘 완료만(이전 완료 N개 보기 `?done=all`, 도구는 전체), 모바일 Todo 부터. E2E 갱신 6/6 | 사용자 피드백 | — |
| 2026-09-04 | rachel-d5 | 버그: "일정 넣어줘" 에 레이첼이 미연결 오답. 로그의 모델 추론에 "calendarId 가 필수라 0 UUID 를 넣겠다" 가 남아 있었고, 없는 id → "설정에서 연결해 주세요" 오류 → 미연결로 전달. 수정: calendarId nullish(uuid 검증 제거, 모르면 기본 캘린더로 폴백), endAt 생략 시 +1시간, 오류 문구를 미연결/쓰기불가로 구분, listEvents 가 캘린더 id·이름을 돌려주고 컨텍스트에 쓰기 가능 캘린더를 명시, 시스템 프롬프트에 "id 지어내지 말 것·길이 묻지 말 것·도구 오류를 그대로 옮기지 말 것" | 사용자 재시도 | 교훈: 도구 오류 문구가 곧 레이첼의 답이 된다. 오류는 원인을 정확히 구분해 써야 한다 |
| 2026-09-04 | rachel-d5 | 버그: 캘린더 화면이 변경 후 자동 갱신 안 됨. 원인은 Realtime 구독이 세션 로드 전에 익명으로 join 해 RLS 가 변경을 조용히 걸러낸 것(브라우저 join 프레임에 access_token 없음 확인, 사용자 JWT 로는 전달됨). `useTableChanges` 가 구독 전에 세션을 읽어 `realtime.setAuth` 하도록 수정 → 삽입 후 0.8초 내 갱신(`scripts/realtime-probe.mjs`). 보드·회의·인박스도 같은 훅이라 함께 고쳐짐. 프롬프트: 종료 시각 불명확 시 무조건 +1시간 | 사용자 확인 | 갱신은 변경(증분)이 있을 때만 — 폴링 없음 |
| 2026-09-04 | rachel-d5 | 할 일↔Google Tasks 흐름 전수 검토. 결함 3개 수정: (1) `bulkUpdate` 이벤트에 카드 스냅샷 없음 → 레이첼의 여러 건 변경이 미러를 안 탐 (2) 링크 FK 캐스케이드로 카드 삭제 시 링크가 먼저 사라져 Google 항목이 남고 다음 pull 에서 새 카드로 재유입(0016 FK 제거) (3) 연결된 카드의 마감을 지우거나 Google 에서 온 마감 없는 항목을 완료하면 Google 항목이 삭제됨 → 연결된 카드는 보관·삭제 때만 제거, 마감 해제는 `due:null` PATCH. 테스트 4개(22 통과), 0016 프로덕션 적용 | 사용자 검증(권한 받기 → 토글 → 양방향 확인) | 설계상 유지: 미러 끄면 Google 항목은 남김, Google 에서 삭제하면 카드는 남고 링크만 해제, 시각은 날짜만 전달 |
| 2026-09-04 | rachel-d5 | 캘린더 결함 수정: 여러 날 일정이 시작일에만 표시(월·주·일정·Today 위젯·레이첼 컨텍스트 전부) → `expandOccurrences` 로 날마다 조각 전개(첫날/계속/마지막 라벨, 월 뷰는 이어진 띠). 종일 편집 창이 배타적 종료일을 보여 줘 저장마다 하루씩 늘던 버그 수정. 경우의 수 테스트 7개(하루 시각·종일 하루·사흘 종일·자정 넘김·정확히 자정 종료·범위 전 시작·정렬). 조회 범위 조건(start<to, end>from)은 정상 | 사용자 확인 | — |
| 2026-09-04 | rachel-d5 | 전체 코드리뷰(에이전트 4개 + knip) 반영·배포. 결함: 녹음 화면 이탈 시 마이크 미해제 → 언마운트에 stop, 회의 요약→기억 추출 미동작 → 이벤트 페이로드 텍스트로 추출, 카드 추가 다이얼로그가 chrono 로드/Realtime 갱신에 제목 초기화, 드래그 종료 서버 호출이 setState 업데이터 안(StrictMode 2회), 일정 편집에서 장소·설명 비우기 안 됨(null 전달), updateEvent 범위 미검증·종일 자정 스냅, 설정 월 예산 미반영, 앱 열 때 캘린더 동기화 트리거 미호출, 오픈 리다이렉트, 팔레트 검색 경합, 잡 러너 payload 오류 재시도·시간 예산, 화자분리 N+1 삭제, 백필이 카드마다 재임베딩, 완료 시 Google PATCH 2회, 매 턴 대화 전체 upsert, 날짜 표기 타임존 누락(서버 UTC), DST 존 종일 오프셋, 여러 날 조각 창 밖 순회(366 가드)·컨텍스트 중복, Intl 포매터 캐시+useMemo. 정리: 미사용 의존성 11개·shadcn 11개·죽은 export 제거, `userContext()` 헬퍼, FEATURE/KIND 라벨 단일화, 인사이트 지표 요청 캐시, 회의 상세 병렬 조회, PaletteHost 앱 레이어 이동 + 코어→모듈 import 금지 룰 | 사용자 실사용 | 남김: 파이널 패스 전체 PCM 메모리 적재(스트리밍 조립), 잡 핸들러 AbortSignal, 4.5MB 본문 한도는 Vercel 100MB 로 완화됐으나 실기기 확인 필요 |
