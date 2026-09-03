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
    await postprocessMeeting(ctx, payload.meetingId, payload.pass);
  },
};
