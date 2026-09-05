import { z } from "zod";
import { type AnyAgentTool, defineTool } from "@/core/contracts";
import { getOrCreateDailyBrief } from "./brief";
import { proactiveTools } from "./proactive-tools";
import { getOrCreateWeeklyReview } from "./review";
import { getTodayPlan } from "./today-plan";

export const insightsTools: Record<string, AnyAgentTool> = {
  ...proactiveTools,
  todayPlan: defineTool({
    description:
      "오늘 계획(마감 없는 일 포함), 고정 일정, 남은 실제 가용 시간과 핵심 1–3개 제안을 읽는다. unknown 가용 시간은 확정하지 않는다. 사용자 동의 후 tasks.plan 또는 tasks.schedule로 실행한다.",
    inputSchema: z.object({}),
    risk: "read",
    execute: async (_input, ctx) => getTodayPlan(ctx),
  }),
  weeklyReview: defineTool({
    description:
      "이번 주 주간 리뷰(지표·패턴·서사)를 가져오거나 만든다. '이번 주 어땠어?' 같은 질문에.",
    inputSchema: z.object({ force: z.boolean().default(false) }),
    risk: "write",
    execute: async ({ force }, ctx) => ({
      review: (await getOrCreateWeeklyReview(ctx, { force })).content_md,
    }),
  }),
  generateBrief: defineTool({
    description:
      "오늘 브리핑을 (다시) 만든다. 사용자가 '오늘 브리핑 해줘' 라고 하면 사용.",
    inputSchema: z.object({ force: z.boolean().default(false) }),
    risk: "write",
    execute: async ({ force }, ctx) => ({
      brief: (await getOrCreateDailyBrief(ctx, { force })).content_md,
    }),
  }),
};
