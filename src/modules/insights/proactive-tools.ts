import { z } from "zod";
import { type AnyAgentTool, defineTool } from "@/core/contracts";
import { proactiveService } from "./proactive";
import { suggestionResponseSchema } from "./proactive-schema";
export const proactiveTools: Record<string, AnyAgentTool> = {
  suggestions: defineTool({
    description:
      "중요한 누락·충돌과 확인 대기 중인 학습 선호 후보를 현재 업무 상태로 다시 확인한다. 조회 실패·오래된 캘린더에서는 확정적인 충돌을 제안하지 않는다.",
    inputSchema: z.object({}),
    risk: "write",
    execute: async (_input, ctx) => {
      const svc = proactiveService(ctx);
      const refreshed = await svc.refresh();
      return { ...(await svc.list(true)), notices: refreshed.notices };
    },
  }),
  respondSuggestion: defineTool({
    description:
      "제안을 나중으로 미루거나 거절하거나 해당 종류를 끈다. 학습 선호는 사용자가 내용을 확인하고 명시적으로 수락한 경우만 accept_preference. 이때 현재 사용자 메시지의 직접 수락 문장을 userQuote로 전달한다. 수락 전에는 개인 규칙으로 적용되지 않는다. expectedVersion은 목록의 updated_at.",
    inputSchema: suggestionResponseSchema,
    risk: "write",
    execute: async (input, ctx) => proactiveService(ctx).respond(input),
  }),
};
