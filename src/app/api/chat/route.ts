import { createAgentUIStreamResponse } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { MODEL_IDS } from "@/core/llm/models";
import { costOfTokens } from "@/core/llm/pricing";
import { recordUsage, splitLanguageModelUsage } from "@/core/llm/usage";
import { registry } from "@/modules";
import { type ChatMetadata, createRachelAgent } from "@/modules/agent/agent";
import { agentService } from "@/modules/agent/service";
import { getHonorific } from "@/modules/agent/settings";

export const maxDuration = 120;

const bodySchema = z.object({
  id: z.string().uuid(),
  messages: z.array(
    z
      .object({
        id: z.string(),
        role: z.enum(["user", "assistant", "system"]),
        parts: z.array(z.unknown()),
      })
      .passthrough(),
  ),
  ui: z
    .object({
      route: z.string(),
      entity: z.object({ type: z.string(), id: z.string() }).optional(),
    })
    .optional(),
});

/** 레이첼 한 턴: 컨텍스트 조립 → 도구 루프 스트림 → 저장·원장. */
export async function POST(req: Request) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  const { id: threadId, messages, ui } = parsed.data;

  const db = await createServerSupabase();
  const ctx = createContext({
    db,
    userId: user.id,
    actor: "agent",
    registry,
    ui,
  });
  const svc = agentService(ctx);
  await svc.ensureThread(threadId);

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const userQuery =
    (
      (lastUser?.parts as Array<{ type: string; text?: string }> | undefined) ??
      []
    ).find((p) => p.type === "text")?.text ?? "";
  const agent = await createRachelAgent({
    ctx,
    registry,
    honorific: await getHonorific(db, user.id),
    userQuery,
  });

  const started = Date.now();
  const usage = { input: 0, cached: 0, output: 0, reasoning: 0 };
  let costUsd = 0;
  const model = MODEL_IDS.chat;

  return createAgentUIStreamResponse({
    agent,
    // biome-ignore lint/suspicious/noExplicitAny: UI 메시지는 서버에서 검증 후 그대로 전달
    uiMessages: messages as any,
    onStepFinish: ({ usage: u }) => {
      const s = splitLanguageModelUsage(u);
      usage.input += s.input;
      usage.cached += s.cached;
      usage.output += s.output;
      usage.reasoning += s.reasoning;
      costUsd = costOfTokens(`openai/${model}`, usage);
    },
    // biome-ignore lint/suspicious/noExplicitAny: 위와 같음
    originalMessages: messages as any,
    messageMetadata: ({ part }): ChatMetadata | undefined => {
      if (part.type === "finish")
        return {
          costUsd,
          inputTokens: usage.input + usage.cached,
          outputTokens: usage.output + usage.reasoning,
          cachedTokens: usage.cached,
        };
      return undefined;
    },
    onFinish: async ({ messages: all }) => {
      const assistant = [...all].reverse().find((m) => m.role === "assistant");
      try {
        await svc.saveMessages(threadId, all as never);
      } catch (e) {
        console.error("[chat] 메시지 저장 실패", e);
      }
      try {
        await recordUsage(db, user.id, {
          provider: "openai",
          model,
          feature: "chat",
          inputTokens: usage.input,
          cachedTokens: usage.cached,
          outputTokens: usage.output,
          reasoningTokens: usage.reasoning,
          costUsd,
          ref: { type: "thread", id: threadId },
          latencyMs: Date.now() - started,
          meta: { messageId: assistant?.id ?? null },
        });
      } catch (e) {
        console.error("[chat] 원장 기록 실패", e);
      }
      try {
        await ctx.emit({
          type: "chat.turn_completed",
          entity: { type: "thread", id: threadId },
          payload: { costUsd },
        });
      } catch (e) {
        console.error("[chat] 이벤트 실패", e);
      }
    },
  });
}
