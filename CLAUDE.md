# Rachel — Claude Code 작업 지침

개인 비서 에이전트 PWA(사용자 1명, Vincent). 한국어로 소통한다. 코드 주석·커밋 본문도 한국어 가능.

## 세션 시작 시 읽는 순서
1. `docs/PLAN.md` §0(프로토콜)과 §9(진행 로그)의 마지막 줄 → 거기 적힌 "다음 Step".
2. 그 Step이 가리키는 `docs/ARCHITECTURE.md` 장(구조·데이터 모델·파이프라인).
3. 필요할 때만 `docs/PRD.md`(요구사항·수용 기준). `docs/reference/`는 참고용.

## 규칙
- **Step 단위로 일한다.** Step = 산출 파일 + 검증 + 커밋. 끝나면 PLAN 체크박스·진행 로그 갱신 후 커밋·푸시.
- **파일을 쓰기 전에 존재 여부를 확인한다.** 같은 폴더를 다른 세션이 쓴 적이 있다.
- 결정을 바꾸면 PRD/ARCHITECTURE를 고치고 PLAN 진행 로그에 남긴다. 조용히 바꾸지 않는다.
- 모듈은 `src/modules/<id>/`에 닫힌다. 다른 모듈 import 금지. DB 접근은 `repository.ts`, 규칙은 `service.ts`, Server Action과 에이전트 도구는 `service`만 호출.
- 모든 AI 호출은 `src/core/llm/client.ts`(LLM) 또는 `src/core/transcription/`(전사) 경유. 사용량·비용을 `llm_usage`에 남긴다.
- 새 테이블은 마이그레이션 + `core.enable_owner_rls()` + 인덱스 + `pnpm db:types`.
- 비밀은 `.env.local`에만. `NEXT_PUBLIC_`에는 Supabase publishable key만.
- API 이름은 구현 시점에 재확인: AI SDK `node_modules/ai/docs/`, Supabase 문서 `.md`, Meta `https://dev.meta.ai/docs/speech-to-text/`.

## 스택 한 줄
Next.js 16(App Router, Turbopack) · Supabase(Postgres·Auth Google·Realtime·pgvector·pg_cron) · Vercel AI SDK v6 + OpenAI `gpt-5.6-luna` · Meta `muse-voice-transcribe-1.0`(배치, 2패스) · shadcn/ui + Tailwind v4 · Serwist PWA · Vercel Hobby.

## 커밋
Conventional Commits, 의미 단위. 트레일러:
```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: <이 세션의 URL>
```

## 명령 (P0 이후 갱신)
`pnpm dev` · `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm db:types` · `supabase start` / `supabase db reset`

## Next.js 규칙
`next dev`가 갱신하는 @AGENTS.md 를 따른다(`node_modules/next/dist/docs/` 참조).
