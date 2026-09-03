import { z } from "zod";
import type { JobHandler } from "@/core/contracts";
import { syncCalendars } from "./sync";

/** 15분 주기·앱 열 때·쓰기 직후. dedupe: calendar.sync:<user> */
export const syncJob: JobHandler<Record<string, never>> = {
  schema: z.object({}),
  timeoutSec: 180,
  maxAttempts: 2,
  run: async (_payload, ctx) => {
    const r = await syncCalendars(ctx);
    if (r.errors.length) console.warn("[calendar.sync]", r.errors);
  },
};
