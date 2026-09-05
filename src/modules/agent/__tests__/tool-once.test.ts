import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { runToolOnce } from "../tool-once";

const available = await localSupabaseAvailable();
describe.skipIf(!available)("chat write retries", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let other: Awaited<ReturnType<typeof testUser>>;
  let ctx: ToolContext;
  beforeAll(async () => {
    user = await testUser("tool-once");
    other = await testUser("tool-other");
    ctx = {
      db: user.db,
      userId: user.id,
      actor: "agent",
      now: new Date(),
      timezone: "Asia/Seoul",
      registry: createRegistry(() => []),
      emit: async () => {},
      enqueue: async () => "",
    };
  });
  afterAll(async () => {
    await user?.cleanup();
    await other?.cleanup();
  });
  it("reuses a successful write despite reordered input and separates users and turns", async () => {
    const execute = vi.fn(async () => ({ id: crypto.randomUUID() }));
    const a = await runToolOnce(
      ctx,
      "turn1",
      "create",
      { title: "보고서", due: null },
      execute,
    );
    expect(
      await runToolOnce(
        ctx,
        "turn1",
        "create",
        { due: null, title: "보고서" },
        execute,
      ),
    ).toEqual(a);
    expect(execute).toHaveBeenCalledTimes(1);
    await runToolOnce(
      { ...ctx, userId: other.id, db: other.db },
      "turn1",
      "create",
      { title: "보고서", due: null },
      execute,
    );
    await runToolOnce(
      ctx,
      "turn2",
      "create",
      { title: "보고서", due: null },
      execute,
    );
    expect(execute).toHaveBeenCalledTimes(3);
    const hidden = await other.db
      .from("agent_tool_runs")
      .select("id")
      .eq("user_id", user.id);
    expect(hidden.data).toEqual([]);
  });
  it("does not repeat a write when failure may have occurred after the change", async () => {
    const execute = vi.fn(async () => {
      throw new Error("response lost");
    });
    await expect(
      runToolOnce(ctx, "uncertain", "create", {}, execute),
    ).rejects.toThrow("response lost");
    await expect(
      runToolOnce(ctx, "uncertain", "create", {}, execute),
    ).rejects.toThrow("이전 변경 결과");
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("allows only one writer for simultaneous requests", async () => {
    const execute = vi.fn(async () => ({ id: crypto.randomUUID() }));
    await Promise.allSettled([
      runToolOnce(ctx, "race", "create", {}, execute),
      runToolOnce(ctx, "race", "create", {}, execute),
    ]);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("does not create a different write while regenerating a response", async () => {
    const execute = vi.fn(async () => ({ id: crypto.randomUUID() }));
    const result = await runToolOnce(
      ctx,
      "regenerate",
      "create",
      { title: "원본" },
      execute,
    );
    expect(
      await runToolOnce(
        ctx,
        "regenerate",
        "create",
        { title: "원본" },
        execute,
        true,
      ),
    ).toEqual(result);
    await expect(
      runToolOnce(
        ctx,
        "regenerate",
        "create",
        { title: "다른 해석" },
        execute,
        true,
      ),
    ).rejects.toThrow("새로 실행하지 않아요");
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
