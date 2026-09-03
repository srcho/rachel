import { z } from "zod";
import type { JobHandler } from "@/core/contracts";
import { getOrCreateDailyBrief } from "./brief";

/** 06:00 KST 크론 또는 첫 접속 시. force 는 재생성. */
export const briefJob: JobHandler<{ force?: boolean }> = {
  schema: z.object({ force: z.boolean().optional() }),
  timeoutSec: 90,
  maxAttempts: 2,
  run: async (payload, ctx) => {
    await getOrCreateDailyBrief(ctx, { force: payload.force });
  },
};
