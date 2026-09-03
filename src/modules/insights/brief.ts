import type { ServiceContext } from "@/core/contracts";
import type { Json } from "@/core/db/types.generated";
import { llmGenerate } from "@/core/llm/client";
import { MODEL_IDS } from "@/core/llm/models";
import { dailyBriefPrompt } from "@/core/llm/prompts/daily-brief";
import { getProfileSettings } from "@/core/settings/profile";
import { dayBounds, localYmd } from "@/core/utils/date";
import { buildDynamicContext } from "@/modules/agent/context";
import { type InsightRow, insightsRepository } from "./repository";

/**
 * 오늘 브리핑. 하루 1회 생성·캐시(insights.daily_brief). force 면 재생성.
 * 컨텍스트는 레이첼과 같은 프로바이더(일정·할 일·기억)를 재사용한다 → 모듈 결합 없음.
 */
export async function getOrCreateDailyBrief(
  ctx: ServiceContext,
  opts: { force?: boolean } = {},
): Promise<InsightRow> {
  const repo = insightsRepository(ctx.db, ctx.userId);
  const today = localYmd(ctx.now, ctx.timezone);
  if (!opts.force) {
    const cached = await repo.get("daily_brief", today);
    if (cached) return cached;
  }
  const settings = await getProfileSettings(ctx.db, ctx.userId);
  const honorific = settings.honorific ?? "빈센트님";
  const context = await buildDynamicContext(
    { ...ctx, ui: undefined },
    ctx.registry,
    "오늘 브리핑",
  );
  const { text } = await llmGenerate({
    db: ctx.db,
    userId: ctx.userId,
    role: "chat",
    feature: "brief",
    ref: { type: "insight", id: `daily_brief:${today}` },
    instructions: dailyBriefPrompt(honorific),
    prompt: context,
    maxOutputTokens: 400,
  });
  const { end } = dayBounds(ctx.now, ctx.timezone);
  return repo.upsert({
    kind: "daily_brief",
    period_start: today,
    period_end: localYmd(new Date(Date.parse(end) - 1), ctx.timezone),
    content_md: text.trim(),
    data: { contextChars: context.length } as Json,
    model: MODEL_IDS.chat,
  });
}
