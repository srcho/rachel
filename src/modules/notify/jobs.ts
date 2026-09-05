import type { JobHandler } from "@/core/contracts";
import { proactiveService } from "@/modules/insights/proactive";
import { type PushPayload, pushPayloadSchema } from "./schema";
import { notifyService } from "./service";

export const sendJob: JobHandler<PushPayload> = {
  schema: pushPayloadSchema,
  timeoutSec: 30,
  maxAttempts: 2,
  run: async (payload, ctx) => {
    if (payload.kind === "proactive") await proactiveService(ctx).refresh();
    const r = await notifyService(ctx).send(payload);
    if (r.sent === 0 && r.removed === 0)
      console.info("[push] 보낼 구독 없음/비활성", payload.kind);
  },
};
