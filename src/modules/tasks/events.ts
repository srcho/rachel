import type { EventHandler } from "@/core/contracts";
import { dateTimeInZone, localYmd } from "@/core/utils/date";
import { tasksRepository } from "./repository";
import { cardSnapshot, tasksService } from "./service";

/** Google Tasks 에서 바뀐 것(완료·제목·마감)을 카드에 반영. origin: google 로 되밀기를 막는다 */
export const gtaskChangedHandler: EventHandler = {
  on: "gtask.changed",
  handle: async (event, ctx) => {
    const p = event.payload as {
      cardId: string;
      title: string;
      dueYmd: string | null;
      completed: boolean;
    };
    const repo = tasksRepository(ctx.db, ctx.userId);
    const card = await repo.getCard(p.cardId);
    if (!card || card.archived_at) return;
    const svc = tasksService(ctx);
    const meta = { origin: "google" as const };
    const patch: {
      title?: string;
      dueAt?: string | null;
      dueHasTime?: boolean;
    } = {};
    if (p.title && p.title !== card.title) patch.title = p.title;
    const cardYmd = card.due_at
      ? localYmd(new Date(card.due_at), ctx.timezone)
      : null;
    if (p.dueYmd !== cardYmd) {
      if (p.dueYmd === null) {
        patch.dueAt = null;
        patch.dueHasTime = false;
      } else {
        // 날짜만 바뀐 것 — 기존 시각은 버리고 그 날 자정(로컬)
        patch.dueAt = dateTimeInZone(`${p.dueYmd}T00:00`, ctx.timezone);
        patch.dueHasTime = false;
      }
    }
    if (Object.keys(patch).length) await svc.updateCard(card.id, patch, meta);
    const isDone = card.completed_at !== null;
    if (p.completed && !isDone) await svc.completeCard(card.id, meta);
    if (!p.completed && isDone) await svc.reopenCard(card.id, meta);
  },
};

/** Google 의 Rachel 목록에 직접 만든 항목 → 카드 */
export const gtaskCreatedHandler: EventHandler = {
  on: "gtask.created",
  handle: async (event, ctx) => {
    const p = event.payload as {
      gtaskId: string;
      listId?: string;
      title: string;
      notes: string;
      dueAt: string | null;
      completed: boolean;
    };
    const svc = tasksService(ctx);
    const card = await svc.createCard(
      {
        creationKey: `google-task:${p.listId ?? "Rachel"}:${p.gtaskId}`,
        title: p.title,
        description: p.notes,
        dueAt: p.dueAt,
        dueHasTime: false,
        source: { type: "google", ref_id: p.gtaskId },
      },
      { origin: "google", gtaskId: p.gtaskId },
    );
    // A failed link handler can leave the card created. Replay its link event on retry.
    if (!card.createdNow)
      await ctx.emit({
        type: "task.created",
        entity: { type: "card", id: card.id },
        requireHandlersSuccess: true,
        payload: {
          card: cardSnapshot(card),
          origin: "google",
          gtaskId: p.gtaskId,
        },
      });
    if (p.completed) await svc.completeCard(card.id, { origin: "google" });
  },
};

/** 미러를 켠 순간: 마감 있는 열린 카드를 전부 다시 내보낸다(백필) */
export const gtasksEnabledHandler: EventHandler = {
  on: "gtasks.enabled",
  handle: async (_event, ctx) => {
    const svc = tasksService(ctx);
    for (let cursor = 0; ; cursor += 200) {
      const cards = await svc.listCards({
        includeCompleted: false,
        limit: 200,
        cursor,
      });
      // Send only mirror jobs; replaying task.updated would re-embed every card.
      for (const card of cards) {
        if (!card.due_at) continue;
        await ctx.enqueue({
          type: "calendar.gtasks_push",
          payload: { card: cardSnapshot(card) },
          dedupeKey: `gtasks_push:${card.id}:backfill`,
        });
      }
      if (cards.length < 200) break;
    }
  },
};
