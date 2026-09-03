import type { ToolContext } from "@/core/contracts";
import type { Registry } from "@/core/registry/registry";

/** 한글 1자 ≈ 1토큰, 영문 4자 ≈ 1토큰 근사 */
export function estimateTokens(text: string): number {
  let t = 0;
  for (const ch of text) t += /[ㄱ-힝]/.test(ch) ? 1 : 0.25;
  return Math.ceil(t);
}

export const CONTEXT_BUDGET_TOKENS = 6000;

/**
 * 동적 컨텍스트 = 시각·타임존 + 화면 컨텍스트 + 모듈 프로바이더 블록.
 * 프로바이더별 예산과 총예산(6K)을 지키고, 초과하는 블록은 잘라 넣는다.
 */
export async function buildDynamicContext(
  ctx: ToolContext,
  registry: Registry,
  userQuery: string,
): Promise<string> {
  const blocks: string[] = [nowLine(ctx.now, ctx.timezone)];
  if (ctx.ui) {
    const entity = ctx.ui.entity
      ? ` · 보고 있는 것: ${ctx.ui.entity.type} ${ctx.ui.entity.id}`
      : "";
    blocks.push(`[화면] ${ctx.ui.route}${entity}`);
  }
  const results = await Promise.all(
    registry.contextProviders().map(async (p) => {
      try {
        const text = await p.build(ctx, userQuery);
        if (!text) return null;
        return truncateToTokens(text, p.budgetTokens);
      } catch (e) {
        console.error("[context]", p.id, e);
        return null;
      }
    }),
  );
  let used = estimateTokens(blocks.join("\n"));
  for (const r of results) {
    if (!r) continue;
    const t = estimateTokens(r);
    if (used + t > CONTEXT_BUDGET_TOKENS) continue;
    blocks.push(r);
    used += t;
  }
  return blocks.join("\n\n");
}

/** "[지금] 2026년 9월 3일 목요일 17:40 (Asia/Seoul, UTC+09:00) · ISO 2026-09-03T17:40:00+09:00" — 상대 날짜·ISO 계산의 기준점 */
export function nowLine(now: Date, timeZone: string): string {
  const date = new Intl.DateTimeFormat("ko-KR", {
    timeZone,
    dateStyle: "full",
  }).format(now);
  const time = new Intl.DateTimeFormat("ko-KR", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
  const human = `${date} ${time}`;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "longOffset",
  }).formatToParts(now);
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "";
  const offsetRaw = get("timeZoneName").replace("GMT", "") || "+00:00";
  const offset = offsetRaw === "" ? "+00:00" : offsetRaw;
  const iso = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}${offset}`;
  return `[지금] ${human} (${timeZone}, UTC${offset}) · ISO ${iso}`;
}

export function truncateToTokens(text: string, budget: number): string {
  if (estimateTokens(text) <= budget) return text;
  const lines = text.split("\n");
  const out: string[] = [];
  let used = 0;
  for (const line of lines) {
    const t = estimateTokens(line);
    if (used + t > budget) break;
    out.push(line);
    used += t;
  }
  return `${out.join("\n")}\n…(생략)`;
}
