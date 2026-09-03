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
    expect((await svc.get(c.id))?.status).toBe("dismissed");
  });
});
