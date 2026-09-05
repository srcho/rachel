import { z } from "zod";
import { type AnyAgentTool, defineTool } from "@/core/contracts";
import { proactiveService } from "@/modules/insights/proactive";
import { suggestionKindSchema } from "@/modules/insights/proactive-schema";
import { NOTIFICATION_KINDS } from "./constants";
import { reminderSettingsSchema } from "./policy";
import { notifyService } from "./service";
export const notifyTools: Record<string, AnyAgentTool> = {
  settings: defineTool({
    description:
      "알림 종류별 설정, 조용한 시간, 일시 중지와 등록 기기 수를 읽는다. 브라우저 알림 권한은 사용자가 설정 화면에서 직접 허용해야 한다.",
    inputSchema: z.object({}),
    risk: "read",
    execute: async (_input, ctx) => notifyService(ctx).status(),
  }),
  updateSettings: defineTool({
    description:
      "명시한 알림 종류와 조용한 시간만 수정한다. 기기의 푸시 권한을 대신 허용하거나 외부 사람에게 알림을 보내지 않는다.",
    inputSchema: z.object({
      notifications: z
        .partialRecord(z.enum(NOTIFICATION_KINDS), z.boolean())
        .optional(),
      reminders: reminderSettingsSchema.partial().optional(),
    }),
    risk: "write",
    execute: async (input, ctx) => notifyService(ctx).setPreferences(input),
  }),
  snooze: defineTool({
    description:
      "모든 푸시 알림을 지정한 시각까지 잠시 중지한다. until=null이면 중지를 해제한다. 선제 제안은 별도로 insights.respondSuggestion에서 미룰 수 있다.",
    inputSchema: z.object({
      until: z.string().datetime({ offset: true }).nullable(),
    }),
    risk: "write",
    execute: async ({ until }, ctx) => notifyService(ctx).snooze(until),
  }),
  setSuggestionKind: defineTool({
    description:
      "특정 종류의 선제 제안을 켜거나 끈다. 끈 종류는 화면과 추가 푸시 모두에서 제외된다.",
    inputSchema: z.object({ kind: suggestionKindSchema, enabled: z.boolean() }),
    risk: "write",
    execute: async ({ kind, enabled }, ctx) => {
      await proactiveService(ctx).setKindEnabled(kind, enabled);
      return { kind, enabled };
    },
  }),
};
