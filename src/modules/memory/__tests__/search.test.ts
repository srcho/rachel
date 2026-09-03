import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ServiceContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { tasksModule } from "@/modules/tasks/module";
import { tasksService } from "@/modules/tasks/service";
import { localSupabaseAvailable, testUser } from "@/test/supabase";

/** 결정적 가짜 임베딩(문자 해시). 같은 단어가 많을수록 가깝다. */
function fakeEmbed(text: string): number[] {
  const v = new Array(1536).fill(0);
  for (const tok of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (!tok) continue;
    let h = 7;
    for (const ch of tok) h = (h * 31 + ch.charCodeAt(0)) % 1536;
    v[h] += 1;
  }
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}
vi.mock("@/core/llm/client", () => ({
  llmEmbed: async ({ value }: { value: string }) => ({
    embedding: fakeEmbed(value),
    costUsd: 0,
  }),
}));

const { reindexSource, searchAll } = await import("../search");
const { memoryModule } = await import("../module");
const available = await localSupabaseAvailable();

describe.skipIf(!available)("search index", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let ctx: ServiceContext;
  beforeAll(async () => {
    user = await testUser("search");
    const registry = createRegistry(() => [tasksModule, memoryModule]);
    ctx = {
      userId: user.id,
      db: user.db,
      actor: "user",
      now: new Date(),
      timezone: "Asia/Seoul",
      registry,
      emit: async () => {},
      enqueue: async () => "",
    };
  });
  afterAll(async () => user?.cleanup());

  it("indexes a card and finds it by hybrid search; removes it when archived", async () => {
    const tasks = tasksService(ctx);
    const card = await tasks.createCard({
      title: "예산 300만원 승인 요청",
      labels: ["재무"],
    });
    await tasks.createCard({ title: "주간 보고서 작성" });
    expect(await reindexSource(ctx, "card", card.id)).toBe(1);
    const hits = await searchAll(ctx, "예산 승인");
    expect(hits[0]?.sourceType).toBe("card");
    expect(hits[0]?.title).toBe("예산 300만원 승인 요청");
    expect(hits[0]?.href).toContain("/tasks/");
    await tasks.archiveCard(card.id);
    expect(await reindexSource(ctx, "card", card.id)).toBe(0);
    expect(
      (await searchAll(ctx, "예산 승인")).some((h) => h.sourceId === card.id),
    ).toBe(false);
  });
});
