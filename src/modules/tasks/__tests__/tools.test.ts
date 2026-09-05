import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ToolContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { tasksTools } from "../tools";

const available = await localSupabaseAvailable();

describe.skipIf(!available)("tasks tools", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let ctx: ToolContext;
  beforeAll(async () => {
    user = await testUser("tools");
    ctx = {
      userId: user.id,
      db: user.db,
      actor: "agent",
      now: new Date(),
      timezone: "Asia/Seoul",
      registry: createRegistry(() => []),
      emit: async () => {},
      enqueue: async () => "",
    };
  });
  afterAll(async () => user?.cleanup());

  it("create → list by column name → complete → undo", async () => {
    const created = (await tasksTools.create?.execute(
      { title: "도구로 만든 카드", priority: 1 } as never,
      ctx,
    )) as { id: string; column: string };
    expect(created.column).toBe("Todo");
    const listed = (await tasksTools.list?.execute(
      { column: "todo" } as never,
      ctx,
    )) as { items: Array<{ id: string }> };
    expect(listed.items.map((c) => c.id)).toContain(created.id);
    const done = (await tasksTools.complete?.execute(
      { id: created.id } as never,
      ctx,
    )) as { completed: boolean; _before: { columnId: string } };
    expect(done.completed).toBe(true);
    await tasksTools.complete?.undo?.(done as never, ctx);
    const back = (await tasksTools.get?.execute(
      { id: created.id } as never,
      ctx,
    )) as { column: string; completed: boolean };
    expect(back.column).toBe("Todo");
    expect(back.completed).toBe(false);
    await tasksTools.delete?.execute({ id: created.id } as never, ctx);
    await expect(
      tasksTools.get?.execute({ id: created.id } as never, ctx),
    ).rejects.toThrow();
  });

  it("rejects unknown column with a helpful message", async () => {
    await expect(
      tasksTools.list?.execute({ column: "없는컬럼" } as never, ctx),
    ).rejects.toThrow(/컬럼/);
  });
});

describe.skipIf(!available)("assistant task acceptance", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let ctx: ToolContext;
  beforeAll(async () => {
    user = await testUser("task-acceptance");
    ctx = {
      userId: user.id,
      db: user.db,
      actor: "agent",
      now: new Date("2026-09-07T00:00:00Z"),
      timezone: "Asia/Seoul",
      registry: createRegistry(() => []),
      emit: async () => {},
      enqueue: async () => "",
    };
  });
  afterAll(async () => user?.cleanup());
  const run = async (name: string, input: unknown) =>
    tasksTools[name]?.execute(input as never, ctx) as Promise<{
      id: string;
      version: string;
      dueAt: string | null;
      title: string;
      column: string;
      archived: boolean;
      completed: number;
      items: Array<{ id: string }>;
      hasMore: boolean;
      nextCursor: number | null;
    }>;

  it("A06 reads all editable task fields and preserves fields omitted from a patch", async () => {
    const created = await run("create", {
      title: "왕복",
      description: "원문",
      planDate: "2026-09-07",
      dueAt: "2026-09-10T03:00:00Z",
      dueHasTime: true,
      repeatRule: { kind: "weekly", interval: 7, weekday: 1 },
    });
    await run("update", { id: created.id, patch: { priority: 0 } });
    const got = await run("get", { id: created.id });
    expect(got).toMatchObject({
      description: "원문",
      planDate: "2026-09-07",
      dueHasTime: true,
      repeatRule: { kind: "weekly", interval: 7, weekday: 1 },
      calendarEventId: null,
      meetingId: null,
    });
    expect(got.dueAt).toBe(created.dueAt);
    expect(got.version).toBeTruthy();
  });
  it("reports one creation across concurrent retries and reused creation Undo preserves it", async () => {
    const { tasksService } = await import("../service");
    const svc = tasksService(ctx);
    await svc.ensureDefaultBoard();
    const cards = await Promise.all([
      svc.createCard({ title: "동시 생성", creationKey: "task-once" }),
      svc.createCard({ title: "동시 생성", creationKey: "task-once" }),
    ]);
    expect(cards[0]?.id).toBe(cards[1]?.id);
    expect(cards.filter((c) => c.createdNow)).toHaveLength(1);
    const reused = await run("create", {
      title: "동시 생성",
      creationKey: "task-once",
    });
    await tasksTools.create?.undo?.(reused as never, ctx);
    expect(await svc.getCard(reused.id)).not.toBeNull();
  });
  it("A12 restores an archived task with the same ID", async () => {
    const card = await run("create", { title: "보관 계약 검토" });
    await run("archive", { id: card.id });
    const page = await run("list", { state: "archived", q: "보관 계약" });
    expect(page.items.map((c: { id: string }) => c.id)).toContain(card.id);
    const restored = await run("restore", { id: card.id });
    expect(restored.id).toBe(card.id);
    expect(restored.archived).toBe(false);
  });
  it("A16 Undo changes only written fields and refuses conflicting later edits", async () => {
    const card = await run("create", {
      title: "이전 제목",
      description: "처음",
    });
    const edit = await run("update", {
      id: card.id,
      patch: { title: "AI 제목" },
    });
    await run("update", {
      id: card.id,
      patch: { description: "사용자 최신 설명" },
    });
    await tasksTools.update?.undo?.(edit as never, ctx);
    expect(await run("get", { id: card.id })).toMatchObject({
      title: "이전 제목",
      description: "사용자 최신 설명",
    });
    const conflicting = await run("update", {
      id: card.id,
      patch: { title: "AI 다시" },
    });
    await run("update", { id: card.id, patch: { title: "사용자 최종 제목" } });
    await expect(
      tasksTools.update?.undo?.(conflicting as never, ctx),
    ).rejects.toThrow(/충돌/);
    expect((await run("get", { id: card.id })).title).toBe("사용자 최종 제목");
  });
  it("A17 completion Undo retains the next occurrence and reports that policy", async () => {
    const card = await run("create", {
      title: "반복 정책",
      repeatRule: { kind: "weekly", interval: 7, weekday: 1 },
    });
    const done = await run("complete", { id: card.id });
    expect(done).toHaveProperty(
      "undoPolicy",
      expect.stringContaining("다음 회차"),
    );
    await tasksTools.complete?.undo?.(done as never, ctx);
    await run("complete", { id: card.id });
    const all = await run("list", { q: "반복 정책", includeCompleted: true });
    expect(all.items).toHaveLength(2);
  });
  it("A18 rejects unsupported biweekly rules", async () => {
    await expect(
      run("create", {
        title: "격주",
        repeatRule: { kind: "weekly", interval: 2, weekday: 1 },
      }),
    ).rejects.toThrow(/격주/);
  });
  it("A29/A30 exposes undated today plans and moves plans without moving deadlines", async () => {
    const undated = await run("create", {
      title: "오늘 계획만",
      planDate: "2026-09-07",
    });
    const due = await run("create", {
      title: "마감 별개",
      planDate: "2026-09-07",
      dueAt: "2026-09-10T03:00:00Z",
    });
    const { tasksContextProvider } = await import("../context");
    expect(await tasksContextProvider.build(ctx, "오늘 뭐부터?")).toContain(
      "오늘 계획만",
    );
    const result = await run("plan", {
      items: [undated, due].map((c) => ({
        id: c.id,
        expectedVersion: c.version,
      })),
      planDate: "2026-09-08",
    });
    expect(result.completed).toBe(2);
    expect((await run("get", { id: due.id })).dueAt).toBe(due.dueAt);
    expect((await run("get", { id: undated.id })).dueAt).toBeNull();
  });
  it("A13 paginates 201 tasks without truncating the final item", async () => {
    const { tasksService } = await import("../service");
    const svc = tasksService(ctx);
    const template = await svc.createCard({ title: "pagination seed" });
    const { error } = await user.db.from("cards").insert(
      Array.from({ length: 201 }, (_, i) => ({
        user_id: user.id,
        board_id: template.board_id,
        column_id: template.column_id,
        title: `pagination-${i}`,
        position: `a${i}`,
      })),
    );
    if (error) throw error;
    const first = await run("list", { q: "pagination-", limit: 200 });
    expect(first.items).toHaveLength(200);
    expect(first.hasMore).toBe(true);
    const last = await run("list", {
      q: "pagination-",
      limit: 200,
      cursor: first.nextCursor,
    });
    expect(last.items).toHaveLength(1);
    expect(last.hasMore).toBe(false);
    expect(
      new Set([...first.items, ...last.items].map((c: { id: string }) => c.id))
        .size,
    ).toBe(201);
  });
});
