import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ServiceContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { agentService } from "../service";

const available = await localSupabaseAvailable();

describe.skipIf(!available)("agentService", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let ctx: ServiceContext;
  beforeAll(async () => {
    user = await testUser("chat");
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

  it("saves UI messages with non-uuid ids and titles the thread from the first user text", async () => {
    const svc = agentService(ctx);
    const threadId = crypto.randomUUID();
    await svc.ensureThread(threadId);
    await svc.saveMessages(threadId, [
      {
        id: "msg-abc123",
        role: "user",
        parts: [{ type: "text", text: "내일 일정 알려줘" }],
      },
      {
        id: "msg-def456",
        role: "assistant",
        parts: [{ type: "text", text: "없어요" }],
      },
    ]);
    // 같은 id 재저장은 덮어쓴다
    await svc.saveMessages(threadId, [
      {
        id: "msg-def456",
        role: "assistant",
        parts: [{ type: "text", text: "없어요!" }],
        metadata: {
          memorySources: [{ id: "memory-test", title: "직접 확인한 기억" }],
        },
      },
    ]);
    const loaded = await svc.loadMessages(threadId);
    expect(loaded.map((m) => m.id)).toEqual(["msg-abc123", "msg-def456"]);
    expect((loaded[1]?.parts[0] as { text: string }).text).toBe("없어요!");
    expect(loaded[1]?.metadata).toEqual({
      memorySources: [{ id: "memory-test", title: "직접 확인한 기억" }],
    });
    expect((await svc.getThread(threadId))?.title).toBe("내일 일정 알려줘");
  });
});
