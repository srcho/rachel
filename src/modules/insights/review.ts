import type { ServiceContext } from "@/core/contracts";
import type { Json } from "@/core/db/types.generated";
import { llmGenerate } from "@/core/llm/client";
import { MODEL_IDS } from "@/core/llm/models";
import { weeklyReviewPrompt } from "@/core/llm/prompts/weekly-review";
import { getUserTimezone } from "@/core/settings/assistant";
import { getProfileSettings } from "@/core/settings/profile";
import { localYmd } from "@/core/utils/date";
import { detectPatterns } from "./patterns";
import { type InsightRow, insightsRepository } from "./repository";

/** 이번 주(월~오늘)를 기준으로 4주 지표·패턴을 모아 luna 1회로 서사. 같은 주는 캐시(force 로 재생성). */
export async function getOrCreateWeeklyReview(
  ctx: ServiceContext,
  opts: { force?: boolean } = {},
): Promise<InsightRow> {
  ctx = { ...ctx, timezone: await getUserTimezone(ctx.db, ctx.userId) };
  const repo = insightsRepository(ctx.db, ctx.userId);
  const todayYmd = localYmd(ctx.now, ctx.timezone);
  const d = new Date(`${todayYmd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const weekStart = d.toISOString().slice(0, 10);
  if (!opts.force) {
    const cached = await repo.get("weekly_review", weekStart);
    if (cached) return cached;
  }
  const range = {
    from: new Date(ctx.now.getTime() - 28 * 86_400_000),
    to: new Date(ctx.now.getTime() + 1),
  };
  const { patterns, facts } = await detectPatterns(ctx, range);
  const settings = await getProfileSettings(ctx.db, ctx.userId);
  const weekly = (
    facts.tasks as Array<{ week: string; created: number; completed: number }>
  ).slice(-2);
  const meetings = (
    facts.meetings as Array<{ week: string; meetings: number; minutes: number }>
  ).slice(-2);
  const cal = (
    facts.calendar as Array<{ week: string; events: number; hours: number }>
  ).slice(-2);
  const cap = (
    facts.capture as Array<{ week: string; captured: number; resolved: number }>
  ).slice(-2);
  const st = facts.streak as { current: number; activeDays30: number };
  const overdue = facts.overdue as { total: number };
  const prompt = [
    `[기간] ${weekStart} 주 (오늘 ${todayYmd})`,
    `[할 일] 이번 주 생성 ${weekly.at(-1)?.created ?? 0} · 완료 ${weekly.at(-1)?.completed ?? 0} (지난주 생성 ${weekly.at(-2)?.created ?? 0} · 완료 ${weekly.at(-2)?.completed ?? 0}) · 지연 ${overdue.total} · 스트릭 ${st.current}일 · 최근 30일 중 완료한 날 ${st.activeDays30}`,
    `[회의] 이번 주 ${meetings.at(-1)?.meetings ?? 0}회 ${meetings.at(-1)?.minutes ?? 0}분 (지난주 ${meetings.at(-2)?.meetings ?? 0}회 ${meetings.at(-2)?.minutes ?? 0}분)`,
    `[일정] 이번 주 ${cal.at(-1)?.events ?? 0}건 ${cal.at(-1)?.hours ?? 0}시간 (지난주 ${cal.at(-2)?.events ?? 0}건 ${cal.at(-2)?.hours ?? 0}시간)`,
    `[캡처] 이번 주 ${cap.at(-1)?.captured ?? 0}건 중 ${cap.at(-1)?.resolved ?? 0}건 정리`,
    `[패턴]\n${patterns.length ? patterns.map((p) => `- ${p.text}`).join("\n") : "- 없음"}`,
  ].join("\n");
  const { text } = await llmGenerate({
    db: ctx.db,
    userId: ctx.userId,
    role: "review",
    feature: "review",
    ref: { type: "insight", id: `weekly_review:${weekStart}` },
    instructions: weeklyReviewPrompt(settings.honorific ?? "빈센트님"),
    prompt,
    maxOutputTokens: 700,
  });
  const end = new Date(d.getTime() + 6 * 86_400_000).toISOString().slice(0, 10);
  const row = await repo.upsert({
    kind: "weekly_review",
    period_start: weekStart,
    period_end: end,
    content_md: text.trim(),
    data: { patterns, prompt } as unknown as Json,
    model: MODEL_IDS.review,
  });
  await ctx.emit({
    type: "insight.weekly_review",
    entity: { type: "insight", id: row.id },
    payload: { weekStart },
  });
  return row;
}
