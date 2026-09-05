import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ServiceContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { memoryService } from "../service";

const available = await localSupabaseAvailable();

/** 결정적 가짜 임베딩: 같은 문장 → 같은 벡터, 다른 문장 → 직교에 가깝게 */
function fakeEmbed(text: string): number[] {
  const v = new Array(1536).fill(0);
  const key = text.replace(/\s+/g, "").toLowerCase();
  for (let i = 0; i < key.length; i++)
    v[(key.charCodeAt(i) * 31 + i) % 1536] += 1;
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

describe.skipIf(!available)("memoryService", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let ctx: ServiceContext;
  const events: string[] = [];
  beforeAll(async () => {
    user = await testUser("memory");
    ctx = {
      userId: user.id,
      db: user.db,
      actor: "agent",
      now: new Date(),
      timezone: "Asia/Seoul",
      registry: createRegistry(() => []),
      emit: async (e) => {
        events.push(e.type);
      },
      enqueue: async () => "",
    };
  });
  afterAll(async () => user?.cleanup());

  it("stores, merges duplicates, recalls, and forgets", async () => {
    const svc = memoryService(ctx, { embed: async (t) => fakeEmbed(t) });
    const a = await svc.remember({
      kind: "preference",
      content: "사용자는 아침형 인간이다",
      source: { type: "manual" },
    });
    expect(a.merged).toBe(false);
    const dup = await svc.remember({
      kind: "preference",
      content: "사용자는 아침형 인간이다",
      importance: 5,
      source: { type: "thread", id: "t1" },
    });
    expect(dup.merged).toBe(true);
    expect(dup.memory.id).toBe(a.memory.id);
    expect(dup.memory.importance).toBe(5);
    const b = await svc.remember({
      kind: "person",
      content: "김민수는 디자인 팀장이다",
      source: { type: "manual" },
    });
    expect(b.merged).toBe(false);
    const recalled = await svc.recall("사용자는 아침형 인간이다", 5);
    expect(recalled[0]?.id).toBe(a.memory.id);
    expect(recalled[0]?.similarity).toBeGreaterThan(0.99);
    expect((await svc.list()).length).toBe(2);
    await svc.update(b.memory.id, { pinned: true });
    expect((await svc.pinned()).map((m) => m.id)).toEqual([b.memory.id]);
    await svc.forget(a.memory.id);
    expect((await svc.list()).length).toBe(1);
    expect(events).toEqual([
      "memory.created",
      "memory.updated",
      "memory.created",
      "memory.updated",
      "memory.forgotten",
    ]);
  });
  it("uses one memory for concurrent retries of a capture", async () => {
    const svc = memoryService(ctx, { embed: async (t) => fakeEmbed(t) });
    const input = {
      creationKey: "capture:retry",
      kind: "fact" as const,
      content: "회의는 오전 10시에 한다",
      source: { type: "manual" as const },
    };
    const [a, b] = await Promise.all([
      svc.remember(input),
      svc.remember(input),
    ]);
    expect(a.memory.id).toBe(b.memory.id);
    expect((await svc.remember(input)).memory.id).toBe(a.memory.id);
    const { count, error } = await user.db
      .from("memories")
      .select("id", { count: "exact", head: true })
      .eq("creation_key", input.creationKey);
    if (error) throw error;
    expect(count).toBe(1);
  });
  it("holds conflicting memories out of recall until the user chooses", async () => {
    const vector = new Array(1536).fill(0);
    vector[0] = 1;
    const svc = memoryService(ctx, { embed: async () => vector });
    const old = await svc.remember({
      kind: "fact",
      content: "출근은 월요일",
      source: { type: "manual" },
    });
    const next = await svc.remember({
      creationKey: "capture:conflict",
      kind: "fact",
      content: "출근은 화요일",
      source: { type: "manual" },
    });
    expect(next.memory.review_against).toBe(old.memory.id);
    expect((await svc.recall("출근")).map((m) => m.id)).not.toContain(
      next.memory.id,
    );
    const resolved = await user.db.rpc("resolve_memory_review", {
      p_id: next.memory.id,
      p_choice: "replace",
    });
    if (resolved.error) throw resolved.error;
    expect((await svc.get(old.memory.id))?.status).toBe("archived");
    expect((await svc.recall("출근")).map((m) => m.id)).toContain(
      next.memory.id,
    );
  });
});
