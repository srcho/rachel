import { type InferAgentUIMessage, stepCountIs, ToolLoopAgent } from "ai";
import type { ToolContext } from "@/core/contracts";
import { ROLE_REASONING, textModel } from "@/core/llm/models";
import { personaInstructions } from "@/core/llm/prompts/persona";
import type { Registry } from "@/core/registry/registry";
import { buildDynamicContext } from "./context";
import { adaptTools } from "./tool-adapter";

export const MAX_STEPS = 6;

export interface RachelAgentInput {
  ctx: ToolContext;
  registry: Registry;
  honorific: string;
  userQuery: string;
}

/** 요청마다 만든다(도구가 ctx 클로저를 가진다). 페르소나(고정) + 도구 안내(고정) + 동적 컨텍스트(꼬리). */
export async function createRachelAgent({
  ctx,
  registry,
  honorific,
  userQuery,
}: RachelAgentInput) {
  const { tools, toolApproval } = adaptTools(registry.tools(), ctx);
  const dynamic = await buildDynamicContext(ctx, registry, userQuery);
  const instructions = [
    personaInstructions({ honorific }),
    "도구 사용: 데이터가 필요하면 먼저 도구로 읽어요. 카드 id 는 사용자에게 보여 주지 않아요. 여러 건을 바꿀 때는 먼저 목록을 보여 주고 확인을 받아요. 도구가 승인을 요청하면 승인 결과를 기다려요.",
    "---",
    dynamic,
  ].join("\n\n");
  return new ToolLoopAgent({
    model: textModel("chat"),
    instructions,
    tools,
    toolApproval,
    stopWhen: stepCountIs(MAX_STEPS),
    reasoning: ROLE_REASONING.chat,
  });
}

export type RachelAgent = Awaited<ReturnType<typeof createRachelAgent>>;
export type RachelUIMessage = InferAgentUIMessage<RachelAgent, ChatMetadata>;

export interface ChatMetadata {
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
}
