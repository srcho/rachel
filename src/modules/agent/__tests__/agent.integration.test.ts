import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createContext } from "@/core/context";
import { createRegistry } from "@/core/registry/registry";
import { tasksModule } from "@/modules/tasks/module";
import { tasksService } from "@/modules/tasks/service";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { createRachelAgent } from "../agent";

const available =
  (await localSupabaseAvailable()) && Boolean(process.env.OPENAI_API_KEY);

/** 실제 luna 호출(≈ $0.001). 로컬 Supabase + OPENAI_API_KEY 가 있을 때만 */
describe.skipIf(!available)("Rachel agent (real LLM)", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  beforeAll(async () => {
    user = await testUser("agent");
  });
  afterAll(async () => user?.cleanup());

  it("creates a card from natural language using tools", async () => {
    const registry = createRegistry(() => [tasksModule]);
    const ctx = createContext({
      db: user.db,
      userId: user.id,
      actor: "agent",
      registry,
      ui: { route: "/tasks" },
    });
    await tasksService(ctx).ensureDefaultBoard();
    const agent = await createRachelAgent({
      ctx,
      registry,
      honorific: "테스터님",
      userQuery: "",
    });
    const result = await agent.generate({
      prompt: "Todo에 '통합 테스트 카드'라는 카드를 우선순위 P1로 만들어줘.",
    });
    const cards = await tasksService(ctx).listCards({ q: "통합 테스트 카드" });
    expect(cards).toHaveLength(1);
    expect(cards[0]?.priority).toBe(1);
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.totalUsage.inputTokens ?? 0).toBeGreaterThan(0);
  }, 60_000);
});
