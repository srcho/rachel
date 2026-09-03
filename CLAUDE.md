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

## 명령
- `pnpm dev`(Turbopack, SW 미등록) · `pnpm build`(= next build && serwist build) · `pnpm start`
- `pnpm typecheck` · `pnpm lint` / `pnpm lint:fix` · `pnpm test`
- 로컬 DB: `pnpm supabase start`(포트 553xx: API 55321·DB 55322·Studio 55323) · `pnpm db:reset` · `pnpm db:types`
- 잡 러너 수동 호출: `curl -X POST -H "x-cron-secret: $CRON_SECRET" localhost:3000/api/jobs/run`
- 로컬 SQL: `docker exec -i supabase_db_rachel psql -U postgres -d postgres`

## 현재 상태 요약
P1 완료(2026-09-03): 칸반·레이첼 채팅·기억·비용 패널이 프로덕션에 있음. 프로덕션 https://rachel-seven-tau.vercel.app (Vercel `rachel`, icn1) · Supabase `rachel` ref `lpieoftpmhvxibhkhayn`(서울, linked). pg_cron `rachel-jobs`가 1분마다 잡 러너 호출. Meta 키만 미발급. 다음은 PLAN §9 참조(P1 S1.1).

## 프로덕션 운영 명령
- 스키마 적용: `pnpm supabase db query --linked -f supabase/migrations/<file>.sql` 후 `pnpm supabase migration repair --status applied <version> --linked` (DB 비밀번호 없이). 또는 `pnpm supabase db push -p <pw>`
- Auth 설정: `supabase/config.toml` 수정 → `set -a; . ./.env.local; set +a; pnpm supabase config push`
- 배포: `vercel --prod --yes` · env: `vercel env add NAME production,preview --force`
- 프로덕션 SQL: `pnpm supabase db query --linked "<sql>"`

## Next.js 규칙
`next dev`가 갱신하는 @AGENTS.md 를 따른다(`node_modules/next/dist/docs/` 참조).
