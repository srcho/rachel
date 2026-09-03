import { z } from "zod";
import type { JobHandler } from "@/core/contracts";
import { captureService } from "./service";

export const triageJob: JobHandler<{ captureId: string }> = {
  schema: z.object({ captureId: z.string().uuid() }),
  timeoutSec: 60,
  maxAttempts: 2,
  run: async ({ captureId }, ctx) => {
    await captureService(ctx).triage(captureId);
  },
};
