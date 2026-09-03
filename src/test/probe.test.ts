import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createContext } from "@/core/context";
import type { Database } from "@/core/db/types.generated";
import { registry } from "@/modules";
import { createRachelAgent } from "@/modules/agent/agent";

/** 임시 프로브: 프로덕션 사용자 컨텍스트로 에이전트를 읽기 전용 질문으로 실행해 도구 호출을 본다. */
const userId = process.env.PROBE_USER_ID;
describe.skipIf(!userId)("probe", () => {
  it("asks about tomorrow", async () => {
    const db = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SECRET_KEY as string,
      { auth: { persistSession: false } },
    );
    const ctx = createContext({
      db,
      userId: userId as string,
      actor: "agent",
      registry,
      ui: { route: "/today" },
    });
    console.info("tools:", Object.keys(registry.tools()).join(", "));
    const agent = await createRachelAgent({
      ctx,
      registry,
      honorific: "빈센트님",
      userQuery: "내일 일정 알려줘",
    });
    const result = await agent.generate({
      prompt: "내일 일정 알려줘. 캘린더 연결 상태도 말해줘.",
    });
    for (const step of result.steps) {
      for (const tc of step.toolCalls)
        console.info(
          "CALL",
          tc.toolName,
          JSON.stringify(tc.input).slice(0, 200),
        );
      for (const tr of step.toolResults)
        console.info(
          "RESULT",
          tr.toolName,
          JSON.stringify(tr.output).slice(0, 400),
        );
    }
    console.info("TEXT:", result.text);
    expect(result.text.length).toBeGreaterThan(0);
  }, 90_000);
});
