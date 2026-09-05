import { z } from "zod";
import type { JobHandler } from "@/core/contracts";
import { agentService } from "@/modules/agent/service";
import { memoryService } from "./service";

/** 스레드 유휴 후 추출. 마지막 30개 메시지의 텍스트만. */
export const extractJob: JobHandler<{
  threadId?: string;
  meetingId?: string;
  /** 회의: 요약 텍스트(meeting.summarized 페이로드) */
  text?: string;
  version?: number;
}> = {
  schema: z.object({
    threadId: z.string().uuid().optional(),
    meetingId: z.string().uuid().optional(),
    text: z.string().optional(),
    version: z.number().int().positive().optional(),
  }),
  timeoutSec: 120,
  run: async (payload, ctx) => {
    if (payload.threadId) {
      const messages = await agentService(ctx).loadMessages(payload.threadId);
      const text = messages
        .slice(-30)
        .filter((m) => m.role === "user")
        .map((m) => {
          const t = (m.parts as Array<{ type: string; text?: string }>)
            .filter((p) => p.type === "text" && p.text)
            .map((p) => p.text)
            .join(" ");
          return t ? `사용자: ${t}` : null;
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
    if (payload.meetingId && payload.text && payload.version) {
      const { data: meeting, error } = await ctx.db
        .from("meetings")
        .select("content_version")
        .eq("id", payload.meetingId)
        .eq("user_id", ctx.userId)
        .maybeSingle();
      if (error) throw error;
      if (!meeting || meeting.content_version !== payload.version) return;
      const r = await memoryService(ctx).extractFrom(
        payload.text,
        { type: "meeting", id: payload.meetingId, version: payload.version },
        { type: "meeting", id: payload.meetingId },
      );
      console.info("[memory.extract] meeting", payload.meetingId, r);
    }
  },
};
