import { z } from "zod";
import { type AnyAgentTool, defineTool } from "@/core/contracts";
import { registry } from "@/modules";
import { getOrCreateDailyBrief } from "./brief";

export const insightsTools: Record<string, AnyAgentTool> = {
  generateBrief: defineTool({
    description:
      "오늘 브리핑을 (다시) 만든다. 사용자가 '오늘 브리핑 해줘' 라고 하면 사용.",
    inputSchema: z.object({ force: z.boolean().default(false) }),
    risk: "read",
    execute: async ({ force }, ctx) => ({
      brief: (await getOrCreateDailyBrief(ctx, registry, { force })).content_md,
    }),
  }),
};
