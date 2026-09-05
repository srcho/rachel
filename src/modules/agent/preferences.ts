import { z } from "zod";
import { type AnyAgentTool, defineTool } from "@/core/contracts";
import {
  assistantPreferencesService,
  assistantSettingsUpdateSchema,
} from "@/core/settings/assistant";

export const preferenceTools: Record<string, AnyAgentTool> = {
  getPreferences: defineTool({
    description:
      "호칭, 답변 길이, 선제 제안 수준, 시간대와 시간 배치 선호를 조회한다. 명시된 값과 기본값·사용자 확인 근거를 구분한다.",
    inputSchema: z.object({}),
    risk: "read",
    execute: async (_, ctx) => assistantPreferencesService(ctx).get(),
  }),
  updatePreferences: defineTool({
    description:
      "사용자가 명시적으로 요청한 운영 선호만 저장한다. 추론한 습관은 먼저 제안하고 수락 전에는 이 도구를 쓰지 않는다. 일회성 예외 요청은 저장하지 않는다. preferredStartHour/EndHour에 null을 주면 선호 시간 제한을 해제한다. 기존 일정·계획·마감은 바꾸지 않는다.",
    inputSchema: z.object({
      changes: assistantSettingsUpdateSchema,
      userQuote: z
        .string()
        .trim()
        .min(1)
        .max(500)
        .describe(
          "현재 사용자 메시지에서 설정 변경 지시 또는 제안 수락을 그대로 인용",
        ),
    }),
    risk: "write",
    execute: async ({ changes, userQuote }, ctx) =>
      assistantPreferencesService(ctx).update(changes, userQuote),
  }),
};
