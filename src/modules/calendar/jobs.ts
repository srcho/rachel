import { z } from "zod";
import type { JobHandler } from "@/core/contracts";
import { gtasksService } from "./gtasks";
import { syncCalendars } from "./sync";

/** 15분 주기·앱 열 때·쓰기 직후. dedupe: calendar.sync:<user>. Google Tasks 되돌려 받기도 함께. */
export const syncJob: JobHandler<Record<string, never>> = {
  schema: z.object({}),
  timeoutSec: 180,
  maxAttempts: 2,
  run: async (_payload, ctx) => {
    const r = await syncCalendars(ctx);
    if (r.errors.length) console.warn("[calendar.sync]", r.errors);
    try {
      await gtasksService(ctx).pull();
    } catch (e) {
      console.warn("[gtasks.pull]", e instanceof Error ? e.message : e);
    }
  },
};

const snapshot = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().default(""),
  dueAt: z.string().nullable(),
  dueHasTime: z.boolean().default(false),
  completed: z.boolean(),
  archived: z.boolean(),
  boardId: z.string(),
  updatedAt: z.string(),
});

/** 카드 하나를 Google Tasks 에 반영 */
export const gtasksPushJob: JobHandler<{ card: z.infer<typeof snapshot> }> = {
  schema: z.object({ card: snapshot }),
  timeoutSec: 60,
  maxAttempts: 3,
  run: async ({ card }, ctx) => {
    await gtasksService(ctx).push(card);
  },
};

/** Google 쪽 변경 가져오기(수동 트리거용; 크론은 sync 잡 안에서) */
export const gtasksPullJob: JobHandler<Record<string, never>> = {
  schema: z.object({}),
  timeoutSec: 120,
  maxAttempts: 2,
  run: async (_p, ctx) => {
    await gtasksService(ctx).pull();
  },
};
