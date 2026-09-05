import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ServiceContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { eventService } from "@/modules/calendar/events";
import { calendarModule } from "@/modules/calendar/module";
import { calendarRepository } from "@/modules/calendar/repository";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { rescheduleTask, scheduleTask, unscheduleTask } from "../scheduling";
import { tasksService } from "../service";

const available = await localSupabaseAvailable();
describe.skipIf(!available)("task time blocking", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let ctx: ServiceContext;
  beforeAll(async () => {
    user = await testUser("scheduling");
    ctx = {
      db: user.db,
      userId: user.id,
      actor: "user",
      now: new Date("2026-09-07T00:00:00Z"),
      timezone: "Asia/Seoul",
      registry: createRegistry(() => [calendarModule]),
      emit: async () => {},
      enqueue: async () => "",
    };
    const repo = calendarRepository(user.db, user.id);
    const integration = await repo.upsertIntegration({
      account_email: user.email,
      status: "needs_reauth",
      scopes: [],
    });
    await repo.upsertCalendars([
      {
        integration_id: integration.id,
        external_id: "primary",
        name: "기본",
        color: null,
        selected: true,
        writable: true,
        is_primary: true,
      },
    ]);
  });
  afterAll(async () => user?.cleanup());
  it("links one event across repeated confirmations while preserving the task deadline", async () => {
    const tasks = tasksService(ctx);
    const card = await tasks.createCard({
      title: "집중 작업",
      dueAt: "2026-09-11T06:00:00Z",
      dueHasTime: true,
    });
    const input = {
      cardId: card.id,
      startAt: "2026-09-07T01:00:00Z",
      durationMinutes: 60 as const,
    };
    const first = await scheduleTask(ctx, input);
    const second = await scheduleTask(ctx, {
      ...input,
      startAt: "2026-09-07T04:00:00Z",
    });
    expect(second.id).toBe(first.id);
    // Reproduce a saved event whose task link did not persist.
    await tasks.updateCard(card.id, { calendarEventId: null });
    const recovered = await scheduleTask(ctx, input);
    expect(recovered.id).toBe(first.id);
    const saved = await tasks.getCard(card.id);
    expect(saved?.calendar_event_id).toBe(first.id);
    expect(saved?.due_at).toBe(card.due_at);
    expect(saved?.due_has_time).toBe(true);
    const events = await calendarRepository(user.db, user.id).listEvents({
      from: "2026-09-07T00:00:00Z",
      to: "2026-09-08T00:00:00Z",
    });
    expect(events).toHaveLength(1);
  });
  it("A10 repairs deleted links, reschedules and unschedules without duplicate blocks", async () => {
    const tasks = tasksService(ctx);
    const card = await tasks.createCard({
      title: "링크 복구",
      dueAt: "2026-09-11T06:00:00Z",
    });
    const input = {
      cardId: card.id,
      startAt: "2026-09-08T01:00:00Z",
      durationMinutes: 60,
    };
    const first = await scheduleTask(ctx, input);
    await eventService(ctx).deleteEvent(first.id);
    const repaired = await scheduleTask(ctx, input);
    expect(repaired.id).not.toBe(first.id);
    expect((await scheduleTask(ctx, input)).id).toBe(repaired.id);
    const moved = await rescheduleTask(ctx, {
      ...input,
      startAt: "2026-09-08T04:00:00Z",
    });
    expect(moved.id).toBe(repaired.id);
    expect(Date.parse(moved.startAt)).toBe(Date.parse("2026-09-08T04:00:00Z"));
    const cancelled = await unscheduleTask(ctx, card.id);
    expect(cancelled.scheduled).toBe(false);
    expect((await tasks.getCard(card.id))?.calendar_event_id).toBeNull();
    const again = await scheduleTask(ctx, input);
    expect(again.id).not.toBe(repaired.id);
    expect((await tasks.getCard(card.id))?.due_at).toBe(card.due_at);
  });
  it("concurrent schedule retries create and link exactly one block", async () => {
    const card = await tasksService(ctx).createCard({
      title: "동시 시간 잡기",
    });
    const input = {
      cardId: card.id,
      startAt: "2026-09-10T01:00:00Z",
      durationMinutes: 60,
    };
    const results = await Promise.all([
      scheduleTask(ctx, input),
      scheduleTask(ctx, input),
    ]);
    expect(results[0]?.id).toBe(results[1]?.id);
    expect((await tasksService(ctx).getCard(card.id))?.calendar_event_id).toBe(
      results[0]?.id,
    );
  });
  it("A11 rejects a conflict inserted after a slot was proposed", async () => {
    const tasks = tasksService(ctx);
    const card = await tasks.createCard({ title: "충돌 재검사" });
    await eventService(ctx).createEvent({
      title: "갑자기 생긴 회의",
      startAt: "2026-09-09T01:00:00Z",
      endAt: "2026-09-09T02:00:00Z",
    });
    await expect(
      scheduleTask(ctx, {
        cardId: card.id,
        startAt: "2026-09-09T01:00:00Z",
        durationMinutes: 60,
      }),
    ).rejects.toThrow();
    expect((await tasks.getCard(card.id))?.calendar_event_id).toBeNull();
  });
});
