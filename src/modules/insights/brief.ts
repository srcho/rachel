import type { ServiceContext } from "@/core/contracts";
import type { Json } from "@/core/db/types.generated";
import { llmGenerate } from "@/core/llm/client";
import { MODEL_IDS } from "@/core/llm/models";
import { dailyBriefPrompt } from "@/core/llm/prompts/daily-brief";
import { getProfileSettings } from "@/core/settings/profile";
import { dayBounds, localYmd } from "@/core/utils/date";
import { buildDynamicContext } from "@/modules/agent/context";
import { type InsightRow, insightsRepository } from "./repository";
import { getTodayPlan } from "./today-plan";

/**
 * 오늘 브리핑. 하루 1회 생성·캐시(insights.daily_brief). force 면 재생성.
 * 컨텍스트는 레이첼과 같은 프로바이더(일정·할 일·기억)를 재사용한다 → 모듈 결합 없음.
 */
export async function getOrCreateDailyBrief(
  ctx: ServiceContext,
  opts: { force?: boolean; scheduled?: boolean } = {},
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
  const plan = await getTodayPlan(ctx);
  const planningContext = JSON.stringify({
    today: plan.today,
    availableMinutes: plan.availableMinutes,
    calendarComplete: plan.calendarStatus?.complete ?? false,
    outcomes: plan.outcomes,
    fixedEvents: plan.fixedEvents,
    plannedCount: plan.planned.length,
  });
  const { text } = await llmGenerate({
    db: ctx.db,
    userId: ctx.userId,
    role: "chat",
    feature: "brief",
    ref: { type: "insight", id: `daily_brief:${today}` },
    instructions: `${dailyBriefPrompt(honorific)}
오늘 먼저 끝낼 결과 1~3개는 제공한 outcomes를 기준으로 제안해요. planDate는 실행 계획이며 dueAt 마감과 달라요. 소요시간 미정 60분은 확인되지 않은 추정이라고 밝혀요. availableMinutes가 null이면 일정 확인이 불완전하므로 여유 있다고 단정하지 마세요. 사용자가 선택하기 전 계획이나 일정이 저장됐다고 말하지 마세요.`,
    prompt: `${context}\n[오늘 계획과 실제 가용 시간]\n${planningContext}`,
    maxOutputTokens: 400,
  });
  const { end } = dayBounds(ctx.now, ctx.timezone);
  const row = await repo.upsert({
    kind: "daily_brief",
    period_start: today,
    period_end: localYmd(new Date(Date.parse(end) - 1), ctx.timezone),
    content_md: text.trim(),
    data: {
      contextChars: context.length,
      planning: {
        availableMinutes: plan.availableMinutes,
        outcomeIds: plan.outcomes.map((c) => c.id),
        asOf: plan.asOf,
      },
    } as Json,
    model: MODEL_IDS.chat,
  });
  await ctx.emit({
    type: "insight.daily_brief",
    entity: { type: "insight", id: row.id },
    payload: {
      scheduled: Boolean(opts.scheduled),
      tldr: text.trim().split("\n")[0],
    },
  });
  return row;
}
