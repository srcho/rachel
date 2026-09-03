import { z } from "zod";
import { type AnyAgentTool, defineTool } from "@/core/contracts";
import { getOrCreateDailyBrief } from "./brief";
import { getOrCreateWeeklyReview } from "./review";

export const insightsTools: Record<string, AnyAgentTool> = {
  weeklyReview: defineTool({
    description:
      "이번 주 주간 리뷰(지표·패턴·서사)를 가져오거나 만든다. '이번 주 어땠어?' 같은 질문에.",
    inputSchema: z.object({ force: z.boolean().default(false) }),
    risk: "read",
    execute: async ({ force }, ctx) => ({
      review: (await getOrCreateWeeklyReview(ctx, { force })).content_md,
    }),
  }),
  generateBrief: defineTool({
    description:
      "오늘 브리핑을 (다시) 만든다. 사용자가 '오늘 브리핑 해줘' 라고 하면 사용.",
    inputSchema: z.object({ force: z.boolean().default(false) }),
    risk: "read",
    execute: async ({ force }, ctx) => ({
      brief: (await getOrCreateDailyBrief(ctx, { force })).content_md,
    }),
  }),
};
