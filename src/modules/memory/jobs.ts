import { z } from "zod";
import type { JobHandler } from "@/core/contracts";
import { agentService } from "@/modules/agent/service";
import { memoryService } from "./service";

/** 스레드 유휴 후 추출. 마지막 30개 메시지의 텍스트만. */
export const extractJob: JobHandler<{ threadId?: string; meetingId?: string }> =
  {
    schema: z.object({
      threadId: z.string().uuid().optional(),
      meetingId: z.string().uuid().optional(),
    }),
    timeoutSec: 120,
    run: async (payload, ctx) => {
      if (payload.threadId) {
        const messages = await agentService(ctx).loadMessages(payload.threadId);
        const text = messages
          .slice(-30)
          .map((m) => {
            const t = (m.parts as Array<{ type: string; text?: string }>)
              .filter((p) => p.type === "text" && p.text)
              .map((p) => p.text)
              .join(" ");
            return t
              ? `${m.role === "user" ? "사용자" : "레이첼"}: ${t}`
              : null;
          })
          .filter(Boolean)
          .join("\n");
        const r = await memoryService(ctx).extractFrom(
          text,
          { type: "thread", id: payload.threadId },
          { type: "thread", id: payload.threadId },
        );
        console.info("[memory.extract] thread", payload.threadId, r);
      }
      // meetingId 는 P3 에서 meetings 모듈이 요약 텍스트를 넘긴다
    },
  };
