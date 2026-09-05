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
  for (const operation of ["조회", "제목 수정", "완료"] as const) {
    it(`representative request: ${operation}`, async () => {
      const registry = createRegistry(() => [tasksModule]);
      const ctx = createContext({
        db: user.db,
        userId: user.id,
        actor: "agent",
        registry,
      });
      const svc = tasksService(ctx);
      const title = `평가용 ${operation} 할 일`;
      const before = await svc.createCard({
        title,
        description: "원래 설명",
        priority: 1,
        dueAt: "2026-09-10T04:00:00Z",
        dueHasTime: true,
      });
      const prompt =
        operation === "조회"
          ? `'${title}' 할 일의 마감을 알려줘. 변경하지 마.`
          : operation === "제목 수정"
            ? `'${title}' 제목만 '수정된 평가 할 일'로 바꿔줘.`
            : `'${title}' 할 일을 완료해줘.`;
      const agent = await createRachelAgent({
        ctx,
        registry,
        honorific: "테스터님",
        userQuery: prompt,
        turnKey: crypto.randomUUID(),
      });
      const started = Date.now();
      const result = await agent.generate({ prompt });
      const after = await svc.getCard(before.id);
      expect(after?.description_md).toBe(before.description_md);
      expect(after?.priority).toBe(1);
      expect(after?.due_at).toBe(before.due_at);
      expect(after?.due_has_time).toBe(true);
      expect(after?.title).toBe(
        operation === "제목 수정" ? "수정된 평가 할 일" : title,
      );
      expect(Boolean(after?.completed_at)).toBe(operation === "완료");
      expect(result.text.length).toBeGreaterThan(0);
      console.info(
        "[luna-eval]",
        JSON.stringify({
          operation,
          latencyMs: Date.now() - started,
          inputTokens: result.totalUsage.inputTokens,
          outputTokens: result.totalUsage.outputTokens,
        }),
      );
    }, 60000);
  }
});
