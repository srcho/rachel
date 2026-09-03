import type { EventHandler } from "@/core/contracts";
import { getProfileSettings } from "@/core/settings/profile";
import type { CardSnapshot } from "./gtasks";
import { gtasksService } from "./gtasks";

/**
 * task.* 이벤트를 받아 Google Tasks 로 미는 잡을 건다.
 * - payload.origin === 'google' 이고 gtaskId 가 있으면(Google 에서 만들어진 카드) 링크만 저장
 * - payload.origin === 'google' 이면(Google 변경의 반영) 되밀지 않는다
 */
export const gtasksPushHandler: EventHandler = {
  on: [
    "task.created",
    "task.updated",
    "task.moved",
    "task.completed",
    "task.reopened",
    "task.archived",
    "task.deleted",
  ],
  handle: async (event, ctx) => {
    const p = event.payload as {
      card?: CardSnapshot;
      origin?: string;
      gtaskId?: string;
    };
    if (!p.card) return;
    if (p.origin === "google") {
      if (p.gtaskId && event.type === "task.created")
        await gtasksService(ctx).link(p.card.id, p.gtaskId);
      return;
    }
    const settings = await getProfileSettings(ctx.db, ctx.userId);
    if (!settings.gtasks?.enabled) return;
    const card =
      event.type === "task.deleted" ? { ...p.card, archived: true } : p.card;
    await ctx.enqueue({
      type: "calendar.gtasks_push",
      payload: { card },
      dedupeKey: `gtasks_push:${card.id}:${card.updatedAt}:${event.type}`,
    });
  },
};
