import { embed, generateText, type ModelMessage, Output, streamText } from "ai";
import type { ZodType } from "zod";
import type { Db } from "@/core/contracts";
import {
  embeddingModel,
  MODEL_IDS,
  ROLE_REASONING,
  type TextRole,
  textModel,
} from "./models";
import { costOfEmbedding, costOfTokens } from "./pricing";
import {
  recordUsage,
  splitLanguageModelUsage,
  type UsageFeature,
  type UsageRef,
} from "./usage";

export interface LlmCallBase {
  db: Db;
  userId: string;
  role: TextRole;
  feature: UsageFeature;
  ref?: UsageRef;
  /** 고정 접두어(프롬프트 캐시) */
  instructions?: string;
  prompt?: string;
  messages?: ModelMessage[];
  maxOutputTokens?: number;
  abortSignal?: AbortSignal;
}

export interface GenerateTextCall extends LlmCallBase {
  output?: undefined;
}
export interface GenerateObjectCall<T> extends LlmCallBase {
  output: ZodType<T>;
}

/**
 * 모든 텍스트 LLM 호출의 단일 입구. 사용량을 단가표로 환산해 llm_usage 에 기록한다.
 * 도구 루프(에이전트)는 agent 모듈이 별도 경로로 처리하되 같은 recordUsage 를 쓴다.
 */
export async function llmGenerate(
  call: GenerateTextCall,
): Promise<{ text: string; costUsd: number }>;
export async function llmGenerate<T>(
  call: GenerateObjectCall<T>,
): Promise<{ output: T; text: string; costUsd: number }>;
export async function llmGenerate<T>(
  call: GenerateTextCall | GenerateObjectCall<T>,
) {
  const started = Date.now();
  const common = {
    model: textModel(call.role),
    instructions: call.instructions,
    maxOutputTokens: call.maxOutputTokens,
    abortSignal: call.abortSignal,
    reasoning: ROLE_REASONING[call.role],
    ...promptPart(call),
  };
  const result = call.output
    ? await generateText({
        ...common,
        output: Output.object({ schema: call.output }),
      })
    : await generateText(common);
  const costUsd = await bookkeep(call, result.usage, started);
  if (call.output)
    return {
      output: (result as { output: T }).output,
      text: result.text,
      costUsd,
    };
  return { text: result.text, costUsd };
}

/** 스트리밍. onFinish 에서 사용량을 기록한다. */
export function llmStream(
  call: GenerateTextCall & {
    onFinish?: (info: { text: string; costUsd: number }) => void;
  },
) {
  const started = Date.now();
  return streamText({
    model: textModel(call.role),
    instructions: call.instructions,
    ...promptPart(call),
    maxOutputTokens: call.maxOutputTokens,
    abortSignal: call.abortSignal,
    reasoning: ROLE_REASONING[call.role],
    onFinish: async ({ text, totalUsage }) => {
      const costUsd = await bookkeep(call, totalUsage, started);
      call.onFinish?.({ text, costUsd });
    },
  });
}

/** AI SDK 의 Prompt 는 prompt 또는 messages 중 하나만 받는다. */
function promptPart(
  call: LlmCallBase,
): { messages: ModelMessage[] } | { prompt: string } {
  if (call.messages) return { messages: call.messages };
  return { prompt: call.prompt ?? "" };
}

async function bookkeep(
  call: LlmCallBase,
  usage: Parameters<typeof splitLanguageModelUsage>[0],
  started: number,
) {
  const u = splitLanguageModelUsage(usage);
  const model = MODEL_IDS[call.role];
  const costUsd = costOfTokens(`openai/${model}`, u);
  await recordUsage(call.db, call.userId, {
    provider: "openai",
    model,
    feature: call.feature,
    inputTokens: u.input,
    cachedTokens: u.cached,
    outputTokens: u.output,
    reasoningTokens: u.reasoning,
    costUsd,
    ref: call.ref,
    latencyMs: Date.now() - started,
  });
  return costUsd;
}

export async function llmEmbed(input: {
  db: Db;
  userId: string;
  value: string;
  feature?: UsageFeature;
  ref?: UsageRef;
}) {
  const started = Date.now();
  const { embedding, usage } = await embed({
    model: embeddingModel(),
    value: input.value,
  });
  const model = MODEL_IDS.embed;
  const costUsd = costOfEmbedding(`openai/${model}`, usage.tokens);
  await recordUsage(input.db, input.userId, {
    provider: "openai",
    model,
    feature: input.feature ?? "embed",
    inputTokens: usage.tokens,
    costUsd,
    ref: input.ref,
    latencyMs: Date.now() - started,
  });
  return { embedding, costUsd };
}
