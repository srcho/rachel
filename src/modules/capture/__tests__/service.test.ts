import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ServiceContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { tasksModule } from "@/modules/tasks/module";
import { tasksService } from "@/modules/tasks/service";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { captureService } from "../service";

const available = await localSupabaseAvailable();

describe.skipIf(!available)("captureService", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let ctx: ServiceContext;
  const jobs: string[] = [];
  beforeAll(async () => {
    user = await testUser("capture");
    ctx = {
      userId: user.id,
      db: user.db,
      actor: "user",
      now: new Date(),
      timezone: "Asia/Seoul",
      registry: createRegistry(() => [tasksModule]),
      emit: async () => {},
      enqueue: async (j) => {
        jobs.push(j.type);
        return "j";
      },
    };
  });
  afterAll(async () => user?.cleanup());

  it("adds to inbox (enqueues triage) and resolves a task proposal via the tasks tool", async () => {
    const svc = captureService(ctx);
    const c = await svc.add({ text: "금요일까지 PRD 검토", origin: "text" });
    expect(jobs).toContain("capture.triage");
    expect((await svc.list("open")).map((x) => x.id)).toContain(c.id);
    const r = await svc.resolve(c.id, {
      type: "task",
      reason: "",
      task: {
        title: "PRD 검토",
        due: "2026-09-05T23:59:00+09:00",
        priority: 1,
      },
    });
    expect(r.type).toBe("task");
    const cards = await tasksService(ctx).listCards({ q: "PRD 검토" });
    expect(cards).toHaveLength(1);
    expect(cards[0]?.priority).toBe(1);
    expect((cards[0]?.source as { type: string }).type).toBe("capture");
    expect((await svc.get(c.id))?.status).toBe("resolved");
    await svc.dismiss(c.id);
    expect((await svc.get(c.id))?.status).toBe("resolved");
    expect(await svc.resolve(c.id)).toEqual(r);
  });
  it("freezes one proposal and produces one card under concurrent confirmation", async () => {
    const svc = captureService(ctx);
    const c = await svc.add({ text: "동시 확정" });
    const proposal = {
      type: "task" as const,
      reason: "",
      task: { title: "중복 없는 후속 작업", priority: 2 },
    };
    const [a, b] = await Promise.all([
      svc.resolve(c.id, proposal),
      svc.resolve(c.id, {
        ...proposal,
        task: { ...proposal.task, title: "다른 제목" },
      }),
    ]);
    expect(a.ref.id).toBe(b.ref.id);
    const { data, error } = await user.db
      .from("cards")
      .select("id")
      .eq("creation_key", `capture:${c.id}`);
    if (error) throw error;
    expect(data).toHaveLength(1);
  });
  it("recovers after creation succeeded but confirmation failed without changing the frozen plan", async () => {
    let fail = true;
    const interrupted = captureService({
      ...ctx,
      emit: async (e) => {
        if (e.type === "task.created" && fail) {
          fail = false;
          throw new Error("lost response");
        }
      },
    });
    const c = await interrupted.add({ text: "복구할 작업" });
    await expect(
      interrupted.resolve(c.id, {
        type: "task",
        reason: "",
        task: { title: "복구할 작업", priority: 1 },
      }),
    ).rejects.toThrow("lost response");
    expect((await interrupted.get(c.id))?.status).toBe("resolving");
    const result = await interrupted.resolve(c.id, { type: "note" });
    expect(result.type).toBe("task");
    expect(
      await tasksService(ctx).listCards({ q: "복구할 작업" }),
    ).toHaveLength(1);
    expect((await interrupted.get(c.id))?.status).toBe("resolved");
  });
});
