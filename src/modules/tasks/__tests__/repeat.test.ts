import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ServiceContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { nextRepeatDue } from "../repeat";
import { tasksService } from "../service";

it("distinguishes fixed weekdays from completion-relative days including DST", () => {
  expect(
    nextRepeatDue(
      { kind: "weekly", weekday: 1, interval: 7 },
      "2026-09-07T01:00:00Z",
      null,
      false,
      "Asia/Seoul",
    ),
  ).toBe("2026-09-14T14:59:00.000Z");
  expect(
    nextRepeatDue(
      { kind: "after_completion", weekday: 1, interval: 3 },
      "2026-09-07T01:00:00Z",
      null,
      false,
      "Asia/Seoul",
    ),
  ).toBe("2026-09-10T14:59:00.000Z");
  expect(
    nextRepeatDue(
      { kind: "after_completion", weekday: 1, interval: 2 },
      "2026-03-07T15:00:00Z",
      "2026-03-07T14:00:00Z",
      true,
      "America/New_York",
    ),
  ).toBe("2026-03-09T13:00:00.000Z");
});
const available = await localSupabaseAvailable();
describe.skipIf(!available)("recurring tasks", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let ctx: ServiceContext;
  beforeAll(async () => {
    user = await testUser("repeat");
    ctx = {
      db: user.db,
      userId: user.id,
      actor: "user",
      timezone: "Asia/Seoul",
      now: new Date("2026-09-07T01:00:00Z"),
      registry: createRegistry(() => []),
      emit: async () => {},
      enqueue: async () => "",
    };
  });
  afterAll(async () => user?.cleanup());
  it("creates one next occurrence across concurrent completion, retry and reopen, retaining history", async () => {
    const svc = tasksService(ctx);
    const card = await svc.createCard({
      title: "매주 정산",
      repeatRule: { kind: "weekly", weekday: 5, interval: 7 },
      checklist: [{ id: "a", text: "영수증", done: true }],
      dueAt: "2026-09-04T14:59:00Z",
    });
    await Promise.all([svc.completeCard(card.id), svc.completeCard(card.id)]);
    await svc.completeCard(card.id);
    await svc.reopenCard(card.id);
    await svc.completeCard(card.id);
    const all = await svc.listCards({ includeCompleted: true });
    expect(all).toHaveLength(2);
    const next = all.find((c) => c.repeat_parent_id === card.id);
    expect(next?.completed_at).toBeNull();
    expect(next?.checklist).toEqual([{ id: "a", text: "영수증", done: false }]);
    expect(new Date(next?.due_at ?? "").toISOString()).toBe(
      "2026-09-11T14:59:00.000Z",
    );
    expect((await svc.getCard(card.id))?.completed_at).not.toBeNull();
  });
});
