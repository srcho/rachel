import { z } from "zod";
import type { JobHandler } from "@/core/contracts";
import { runBackup } from "./backup";

export const backupJob: JobHandler<Record<string, never>> = {
  schema: z.object({}),
  timeoutSec: 240,
  maxAttempts: 2,
  run: async (_p, ctx) => {
    const r = await runBackup(ctx);
    console.info("[backup]", r.path, r.bytes, "bytes");
  },
};
