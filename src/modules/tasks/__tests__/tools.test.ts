import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ToolContext } from "@/core/contracts";
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
    )) as Array<{ id: string }>;
    expect(listed.map((c) => c.id)).toContain(created.id);
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
    await tasksTools.create?.undo?.(created as never, ctx);
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
