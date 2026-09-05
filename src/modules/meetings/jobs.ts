import { z } from "zod";
import type { JobHandler } from "@/core/contracts";
import { postprocessMeeting } from "./postprocess";

export const postprocessJob: JobHandler<{
  meetingId: string;
  pass: "live" | "final";
}> = {
  schema: z.object({
    meetingId: z.string().uuid(),
    pass: z.enum(["live", "final"]).default("live"),
  }),
  timeoutSec: 180,
  maxAttempts: 2,
  run: async (payload, ctx) => {
    const result = await postprocessMeeting(
      ctx,
      payload.meetingId,
      payload.pass,
    );
    if (result?.status === "source_changed")
      throw new Error(
        "회의 원문이 변경되어 최신 내용으로 요약을 다시 시도해요",
      );
  },
};
