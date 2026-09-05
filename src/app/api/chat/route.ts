import { createHash } from "node:crypto";
import { createAgentUIStreamResponse } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { requireEnv } from "@/core/env";
import { budgetStatus } from "@/core/llm/budget";
import { MODEL_IDS } from "@/core/llm/models";
import { costOfTokens } from "@/core/llm/pricing";
import { PERSONA_VERSION } from "@/core/llm/prompts/persona";
import { recordUsage, splitLanguageModelUsage } from "@/core/llm/usage";
import { getUserTimezone } from "@/core/settings/assistant";
import { registry } from "@/modules";
import {
  type ChatMetadata,
  createRachelAgent,
  MAX_STEPS,
} from "@/modules/agent/agent";
import { approvalSecret } from "@/modules/agent/approvals";
import { executionStatusSummary } from "@/modules/agent/execution";
import { trustedMessages } from "@/modules/agent/messages";
import { agentService } from "@/modules/agent/service";
import { getHonorific } from "@/modules/agent/settings";

export const maxDuration = 120;

const bodySchema = z.object({
  retry: z.boolean().optional(),
  id: z.string().uuid(),
  messages: z
    .array(
      z
        .object({
          id: z.string(),
          role: z.enum(["user", "assistant"]),
          parts: z.array(z.unknown()).max(1000),
        })
        .passthrough(),
    )
    .min(1)
    .max(1000),
  ui: z
    .object({
      route: z.string().max(500),
      label: z.string().max(500).optional(),
      dateRange: z
        .object({ from: z.string().date(), to: z.string().date() })
        .optional(),
      entity: z.object({ type: z.string(), id: z.string() }).optional(),
    })
    .optional(),
});

/** 레이첼 한 턴: 컨텍스트 조립 → 도구 루프 스트림 → 저장·원장. */
export async function POST(req: Request) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  const { id: threadId, messages: clientMessages, ui, retry } = parsed.data;

  const db = await createServerSupabase();
  const ctx = createContext({
    db,
    userId: user.id,
    actor: "agent",
    registry,
    ui,
    timezone: await getUserTimezone(db, user.id),
  });
  const svc = agentService(ctx);
  ctx.memoryReferences = [];
  await svc.ensureThread(threadId);

  let trusted: ReturnType<typeof trustedMessages>;
  try {
    trusted = trustedMessages(await svc.loadMessages(threadId), clientMessages);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "잘못된 메시지예요." },
      { status: 400 },
    );
  }
  const { messages, user: lastUser } = trusted;
  await svc.saveMessages(threadId, [lastUser]);
  const userQuery = lastUser.parts.map((p) => p.text).join("\n");
  const budget = await budgetStatus(db, user.id);
  if (budget.level === "over")
    return NextResponse.json(
      {
        error:
          "이번 달 AI 예산에 도달했어요. 완료된 변경은 유지돼요. 작업 기록을 확인하거나 설정에서 예산을 변경해 주세요.",
      },
      { status: 429 },
    );
  let costUsd = 0;
  let steps = 0;
  let lastFinishReason = "";
  let execution: ChatMetadata["execution"];
  const turnKey = `${threadId}:${lastUser.id}`;
  const overBudget = () =>
    budget.budgetUsd !== null && budget.spentUsd + costUsd >= budget.budgetUsd;
  const stopReason = (): ChatMetadata["stopReason"] =>
    overBudget()
      ? "budget"
      : steps >= MAX_STEPS && lastFinishReason === "tool-calls"
        ? "step_limit"
        : undefined;
  ctx.latestUserMessage = { id: lastUser.id, text: userQuery, threadId };
  const agent = await createRachelAgent({
    ctx,
    registry,
    honorific: await getHonorific(db, user.id),
    userQuery,
    turnKey,
    shouldStop: overBudget,
    retry,
    approvalSecret: approvalSecret(
      requireEnv("SUPABASE_SECRET_KEY"),
      user.id,
      threadId,
    ),
  });

  const started = Date.now();
  const usage = { input: 0, cached: 0, output: 0, reasoning: 0 };
  const model = MODEL_IDS.chat;

  return createAgentUIStreamResponse({
    agent,
    abortSignal: req.signal,
    generateMessageId: () =>
      `reply-${createHash("sha256").update(`${threadId}:${lastUser.id}`).digest("hex")}`,
    // biome-ignore lint/suspicious/noExplicitAny: UI 메시지는 서버에서 검증 후 그대로 전달
    uiMessages: messages as any,
    onStepFinish: async ({ usage: u, finishReason }) => {
      steps++;
      lastFinishReason = finishReason;
      const s = splitLanguageModelUsage(u);
      usage.input += s.input;
      usage.cached += s.cached;
      usage.output += s.output;
      usage.reasoning += s.reasoning;
      costUsd = costOfTokens(`openai/${model}`, usage);
      try {
        const status = await executionStatusSummary(ctx, turnKey);
        execution = {
          total: status.total,
          done: status.done,
          unfinished: status.unfinished.length,
        };
      } catch (e) {
        console.error("[chat] 실행 기록 조회 실패", e);
      }
    },
    // biome-ignore lint/suspicious/noExplicitAny: 위와 같음
    originalMessages: messages as any,
    messageMetadata: ({ part }): ChatMetadata | undefined => {
      if (part.type === "finish")
        return {
          memorySources: ctx.memoryReferences,
          stopReason: stopReason(),
          execution,
          costUsd,
          inputTokens: usage.input + usage.cached,
          outputTokens: usage.output + usage.reasoning,
          cachedTokens: usage.cached,
        };
      return undefined;
    },
    onFinish: async ({ messages: all, isAborted }) => {
      const assistant = [...all].reverse().find((m) => m.role === "assistant");
      if (assistant)
        assistant.metadata = {
          ...(assistant.metadata as ChatMetadata),
          execution,
          stopReason: isAborted ? "interrupted" : stopReason(),
        };
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
          meta: {
            messageId: assistant?.id ?? null,
            promptVersion: PERSONA_VERSION,
            steps,
            stopReason: isAborted
              ? "interrupted"
              : (stopReason() ?? "finished"),
            execution: execution ?? null,
          },
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
