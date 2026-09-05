import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ServiceContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { tasksRepository } from "../repository";
import { tasksService } from "../service";

const available = await localSupabaseAvailable();

describe.skipIf(!available)("tasksService (local Supabase)", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let other: Awaited<ReturnType<typeof testUser>>;
  const events: string[] = [];
  let ctx: ServiceContext;

  beforeAll(async () => {
    user = await testUser("tasks");
    other = await testUser("other");
    ctx = {
      userId: user.id,
      db: user.db,
      actor: "user",
      now: new Date("2026-09-03T01:00:00Z"),
      timezone: "Asia/Seoul",
      registry: createRegistry(() => []),
      emit: async (e) => {
        events.push(e.type);
      },
      enqueue: async () => "job",
    };
  });
  afterAll(async () => {
    await user?.cleanup();
    await other?.cleanup();
  });

  it("creates the default board with four columns once", async () => {
    const svc = tasksService(ctx);
    const b1 = await svc.ensureDefaultBoard();
    const b2 = await svc.ensureDefaultBoard();
    expect(b1.id).toBe(b2.id);
    const view = await svc.getBoardView();
    expect(view.columns.map((c) => c.name)).toEqual([
      "Backlog",
      "Todo",
      "Doing",
      "Done",
    ]);
    expect(view.columns[3]?.is_done).toBe(true);
  });

  it("creates cards in Todo with increasing positions and emits events", async () => {
    const svc = tasksService(ctx);
    const a = await svc.createCard({ title: "첫 카드" });
    const b = await svc.createCard({
      title: "둘째 카드",
      priority: 0,
      labels: ["urgent"],
    });
    const view = await svc.getBoardView();
    const todo = view.columns.find((c) => c.name === "Todo");
    expect(a.column_id).toBe(todo?.id);
    expect(a.position < b.position).toBe(true);
    expect(events.filter((e) => e === "task.created")).toHaveLength(2);
  });

  it("moves a card between neighbours updating only that row", async () => {
    const svc = tasksService(ctx);
    const view = await svc.getBoardView();
    const [a, b] = view.cards;
    if (!a || !b) throw new Error("cards missing");
    const c = await svc.createCard({ title: "셋째" });
    // c 를 a 와 b 사이로
    const { card } = await svc.moveCard(c.id, {
      columnId: c.column_id,
      afterId: a.id,
      beforeId: b.id,
    });
    expect(card.position > a.position && card.position < b.position).toBe(true);
    const after = await svc.getBoardView();
    expect(after.cards.map((x) => x.title)).toEqual([
      "첫 카드",
      "셋째",
      "둘째 카드",
    ]);
    // 다른 카드의 updated_at 은 그대로
    expect(after.cards.find((x) => x.id === a.id)?.updated_at).toBe(
      a.updated_at,
    );
  });

  it("completing moves to Done and sets completed_at; reopening clears it", async () => {
    const svc = tasksService(ctx);
    const view = await svc.getBoardView();
    const card = view.cards[0];
    if (!card) throw new Error("card missing");
    const { card: done } = await svc.completeCard(card.id);
    expect(done.completed_at).not.toBeNull();
    expect(events).toContain("task.completed");
    const todo = view.columns.find((c) => c.name === "Todo");
    if (!todo) throw new Error("todo missing");
    const { card: reopened } = await svc.moveCard(card.id, {
      columnId: todo.id,
    });
    expect(reopened.completed_at).toBeNull();
    expect(events).toContain("task.reopened");
  });

  it("filters by due date in the user's timezone", async () => {
    const svc = tasksService(ctx);
    await svc.createCard({
      title: "오늘 마감",
      dueAt: "2026-09-03T14:00:00+09:00",
    });
    await svc.createCard({
      title: "지난 마감",
      dueAt: "2026-09-01T09:00:00+09:00",
    });
    await svc.createCard({
      title: "다음주",
      dueAt: "2026-09-08T09:00:00+09:00",
    });
    expect((await svc.listCards({ due: "today" })).map((c) => c.title)).toEqual(
      ["오늘 마감"],
    );
    expect(
      (await svc.listCards({ due: "overdue" })).map((c) => c.title),
    ).toEqual(["지난 마감"]);
    expect((await svc.listCards({ due: "week" })).map((c) => c.title)).toEqual([
      "오늘 마감",
      "다음주",
    ]);
    expect((await svc.listCards({ q: "마감" })).length).toBe(2);
  });

  it("bulk update returns previous state for undo", async () => {
    const svc = tasksService(ctx);
    const cards = await svc.listCards({ due: "week" });
    const { cards: updated, before } = await svc.bulkUpdate(
      cards.map((c) => c.id),
      { priority: 1 },
    );
    expect(updated.every((c) => c.priority === 1)).toBe(true);
    expect(before.map((c) => c.priority)).toEqual([2, 2]);
  });

  it("refuses to delete a column with cards, and RLS hides rows from other users", async () => {
    const svc = tasksService(ctx);
    const view = await svc.getBoardView();
    const todo = view.columns.find((c) => c.name === "Todo");
    if (!todo) throw new Error("todo missing");
    await expect(svc.deleteColumn(todo.id)).rejects.toThrow(/카드가/);
    const otherRepo = tasksRepository(other.db, other.id);
    expect(await otherRepo.listBoards()).toEqual([]);
    expect(await otherRepo.getCard(view.cards[0]?.id ?? "")).toBeNull();
    // 다른 사용자가 update 를 시도해도 0행
    const { data } = await other.db
      .from("cards")
      .update({ title: "hacked" })
      .eq("id", view.cards[0]?.id ?? "")
      .select("*");
    expect(data).toEqual([]);
  });

  it("각 컬럼 첫 카드끼리(position 이 같음) 다른 컬럼 첫 카드 앞으로 옮길 수 있다", async () => {
    const svc = tasksService(ctx);
    const view = await svc.getBoardView();
    const todo = view.columns.find((c) => c.name === "Todo");
    const doing = view.columns.find((c) => c.name === "Doing");
    if (!todo || !doing) throw new Error("columns");
    const a = await svc.createCard({ title: "A(Todo 첫)", columnId: todo.id });
    const c = await svc.createCard({
      title: "C(Doing 첫)",
      columnId: doing.id,
    });
    const { card } = await svc.moveCard(a.id, {
      columnId: doing.id,
      beforeId: c.id,
    });
    expect(card.column_id).toBe(doing.id);
    expect(card.position < c.position).toBe(true);
  });
  it("keeps the deadline when replanning, persists checklists, and restores archived tasks", async () => {
    const svc = tasksService(ctx);
    const deadline = "2026-09-10T01:00:00Z";
    const card = await svc.createCard({
      title: "계획과 마감 분리",
      dueAt: deadline,
      planDate: "2026-09-03",
    });
    expect(
      (await svc.listCards({ planDate: "2026-09-03" })).map((c) => c.id),
    ).toContain(card.id);
    const { card: updated } = await svc.updateCard(card.id, {
      planDate: "2026-09-04",
      checklist: [{ id: "step-1", text: "자료 확인", done: true }],
    });
    expect(updated.due_at).toBe(card.due_at);
    expect(updated.checklist).toEqual([
      { id: "step-1", text: "자료 확인", done: true },
    ]);
    expect(
      (await svc.listCards({ planDate: "2026-09-03" })).map((c) => c.id),
    ).not.toContain(card.id);
    await svc.archiveCard(card.id);
    expect(
      (await svc.getBoardView(card.board_id)).cards.map((c) => c.id),
    ).not.toContain(card.id);
    expect(
      (await svc.getBoardView(card.board_id, { archived: true })).cards.map(
        (c) => c.id,
      ),
    ).toContain(card.id);
    await svc.archiveCard(card.id, false);
    expect(
      (await svc.getBoardView(card.board_id)).cards.map((c) => c.id),
    ).toContain(card.id);
    expect(
      (
        await tasksService({
          ...ctx,
          userId: other.id,
          db: other.db,
        }).listCards({ planDate: "2026-09-04" })
      ).map((c) => c.id),
    ).not.toContain(card.id);
  });
});
