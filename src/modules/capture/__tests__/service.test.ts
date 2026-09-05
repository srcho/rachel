import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ServiceContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { tasksModule } from "@/modules/tasks/module";
import { tasksService } from "@/modules/tasks/service";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { captureIndexer } from "../indexer";
import { captureService } from "../service";
import { captureTools } from "../tools";

function tool(name: string) {
  const found = captureTools[name];
  if (!found) throw new Error(`missing capture tool ${name}`);
  return found;
}

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
    expect(await svc.resolve(c.id)).toEqual({ ...r, changed: false });
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
  it("A08 validates dates before freezing and accepts a corrected task override", async () => {
    const svc = captureService(ctx);
    const c = await svc.add({ text: "날짜 교정 작업" });
    await expect(
      tool("resolve").execute(
        {
          id: c.id,
          override: {
            type: "task",
            reason: "",
            task: { title: "날짜 교정 작업", due: "tomorrow", priority: 2 },
          },
        },
        ctx,
      ),
    ).rejects.toThrow();
    expect((await svc.get(c.id))?.status).toBe("inbox");
    expect(
      await tasksService(ctx).listCards({ q: "날짜 교정 작업" }),
    ).toHaveLength(0);
    await expect(
      svc.resolve(c.id, { type: "task", task: { title: "   ", priority: 2 } }),
    ).rejects.toThrow();
    expect((await svc.get(c.id))?.status).toBe("inbox");
    const resolved = await tool("resolve").execute(
      {
        id: c.id,
        override: {
          type: "task",
          reason: "",
          task: {
            title: "날짜 교정 작업",
            due: "2026-09-06T23:59:00+09:00",
            priority: 2,
          },
        },
      },
      ctx,
    );
    expect(resolved.type).toBe("task");
    expect(
      await tasksService(ctx).listCards({ q: "날짜 교정 작업" }),
    ).toHaveLength(1);
  });

  it("A08 releases legacy malformed frozen dates for correction or cancellation", async () => {
    const svc = captureService(ctx);
    for (const cancel of [false, true]) {
      const c = await svc.add({ text: "과거 날짜 오류" });
      const { error } = await user.db
        .from("captures")
        .update({
          status: "resolving",
          triage: {
            type: "event",
            reason: "",
            event: {
              title: "과거 날짜 오류",
              startAt: "tomorrow",
              endAt: "later",
              allDay: false,
            },
          },
        })
        .eq("id", c.id);
      if (error) throw error;
      if (cancel)
        expect(await svc.dismiss(c.id)).toMatchObject({
          changed: true,
          status: "dismissed",
        });
      else
        expect(
          await svc.resolve(c.id, {
            type: "task",
            task: { title: "과거 오류 교정", priority: 2 },
          }),
        ).toMatchObject({ type: "task", status: "resolved" });
    }
  });

  it("A24 never permits editing, cancellation or deletion while an execution result is uncertain", async () => {
    const svc = captureService({
      ...ctx,
      emit: async (e) => {
        if (e.type === "task.created") throw new Error("lost response");
      },
    });
    const c = await svc.add({ text: "확인 중인 작업" });
    await expect(
      svc.resolve(c.id, {
        type: "task",
        reason: "",
        task: { title: "확인 중인 작업", priority: 2 },
      }),
    ).rejects.toThrow("lost response");
    const frozen = await svc.get(c.id);
    expect(await svc.dismiss(c.id)).toMatchObject({
      changed: false,
      status: "resolving",
    });
    await expect(
      svc.edit(c.id, "다른 작업", frozen?.updated_at ?? ""),
    ).rejects.toThrow("생성 결과");
    await expect(svc.remove(c.id, frozen?.updated_at ?? "")).rejects.toThrow(
      "확정 중",
    );
    expect(await svc.resolve(c.id, { type: "note" })).toMatchObject({
      type: "task",
      status: "resolved",
    });
    expect(
      await tasksService(ctx).listCards({ q: "확인 중인 작업" }),
    ).toHaveLength(1);
  });

  it("A23 finds processed notes with stable links, restores the same ID and retains the destination", async () => {
    const svc = captureService(ctx);
    const c = await svc.add({ text: "처리한 참고 메모 검색어" });
    const resolved = await svc.resolve(c.id, { type: "note" });
    expect(resolved.ref).toEqual({
      type: "note",
      id: c.id,
      href: `/capture/${c.id}`,
    });
    const page = await tool("list").execute(
      { status: "resolved", q: "참고 메모 검색어" },
      ctx,
    );
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: c.id,
      href: `/capture/${c.id}`,
      text: c.raw_text,
    });
    expect(await tool("get").execute({ id: c.id }, ctx)).toMatchObject({
      status: "resolved",
      text: c.raw_text,
    });
    expect(await captureIndexer.chunks(c.id, ctx)).toMatchObject([
      { content: c.raw_text, metadata: { href: `/capture/${c.id}` } },
    ]);
    expect(await tool("restore").execute({ id: c.id }, ctx)).toMatchObject({
      changed: true,
      status: "triaged",
    });
    expect(
      (await svc.listPage({ q: "참고 메모 검색어" })).items.map((x) => x.id),
    ).toEqual([c.id]);
    expect((await svc.resolve(c.id)).ref).toEqual(resolved.ref);
    expect(await tool("dismiss").execute({ id: c.id }, ctx)).toMatchObject({
      changed: false,
      status: "resolved",
    });
    expect(
      await tool("dismiss").execute({ id: crypto.randomUUID() }, ctx),
    ).toMatchObject({ changed: false, status: "missing" });
  });

  it("lists all search pages and rejects stale raw edits without erasing linked resources", async () => {
    const svc = captureService(ctx);
    for (let i = 0; i < 3; i++)
      await svc.add({ text: `pagination capture ${i}` });
    const first = await svc.listPage({
      status: "all",
      q: "pagination capture",
      limit: 2,
    });
    expect(first).toMatchObject({ total: 3, hasMore: true, nextOffset: 2 });
    const last = await svc.listPage({
      status: "all",
      q: "pagination capture",
      limit: 2,
      offset: first.nextOffset ?? 0,
    });
    expect(last).toMatchObject({ hasMore: false, nextOffset: null });
    expect(new Set([...first.items, ...last.items].map((c) => c.id)).size).toBe(
      3,
    );
    const c = first.items[0];
    if (!c) throw new Error("missing first page");
    const edited = await svc.edit(c.id, "수정된 원문", c.updated_at);
    await expect(svc.edit(c.id, "낡은 원문", c.updated_at)).rejects.toThrow(
      "변경",
    );
    const resolved = await svc.resolve(c.id, {
      type: "task",
      reason: "",
      task: { title: "삭제 후에도 남는 작업", priority: 2 },
    });
    expect((await svc.get(c.id))?.raw_text).toBe(edited.raw_text);
    await svc.restore(c.id);
    await expect(svc.resolve(c.id, { type: "note" })).rejects.toThrow(
      "연결된 원본",
    );
    expect((await svc.resolve(c.id)).ref).toEqual(resolved.ref);
    const current = await svc.get(c.id);
    await expect(
      captureService({
        ...ctx,
        approvedVersions: { [`captures:${c.id}`]: c.updated_at },
      }).remove(c.id, current?.updated_at ?? ""),
    ).rejects.toThrow("승인한 메모 버전");
    await svc.remove(c.id, current?.updated_at ?? "");
    expect(await svc.get(c.id)).toBeNull();
    expect(await captureIndexer.chunks(c.id, ctx)).toEqual([]);
    expect(
      await tasksService(ctx).listCards({ q: "삭제 후에도 남는 작업" }),
    ).toHaveLength(1);
  });
});
