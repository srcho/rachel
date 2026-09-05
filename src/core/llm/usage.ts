import type { Db } from "@/core/contracts";
import type { Json } from "@/core/db/types.generated";
import { pricingFor } from "./pricing";

export type UsageFeature =
  | "chat"
  | "summarize"
  | "extract"
  | "brief"
  | "review"
  | "triage"
  | "embed"
  | "transcribe_live"
  | "transcribe_final"
  | "voice_input";

export interface UsageRef {
  type: "thread" | "meeting" | "insight" | "capture" | "memory";
  id: string;
}

export interface UsageRecordInput {
  provider: "openai" | "meta";
  model: string;
  feature: UsageFeature;
  inputTokens?: number;
  cachedTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  audioSeconds?: number;
  costUsd: number;
  ref?: UsageRef;
  latencyMs?: number;
  meta?: Record<string, unknown>;
}

/** llm_usage 원장 기록. 실패해도 본 작업을 깨지 않는다(로그만). */
export async function recordUsage(
  db: Db,
  userId: string,
  u: UsageRecordInput,
): Promise<void> {
  const unitPrices = pricingFor(`${u.provider}/${u.model}`) ?? null;
  const { error } = await db.from("llm_usage").insert({
    user_id: userId,
    provider: u.provider,
    model: u.model,
    feature: u.feature,
    input_tokens: u.inputTokens ?? 0,
    cached_tokens: u.cachedTokens ?? 0,
    output_tokens: u.outputTokens ?? 0,
    reasoning_tokens: u.reasoningTokens ?? 0,
    audio_seconds: u.audioSeconds ?? 0,
    unit_prices: unitPrices as unknown as Json,
    cost_usd: u.costUsd,
    ref: (u.ref ?? null) as unknown as Json,
    latency_ms: u.latencyMs ?? null,
    // Older rows may count reasoning both in output_tokens and separately in cost estimates.
    // This marker describes our accounting, not the provider's invoiced charge.
    meta: {
      ...(u.meta ?? {}),
      tokenAccounting: "disjoint-v2",
    } as unknown as Json,
  });
  if (error) console.error("[llm_usage] 기록 실패", u.feature, error.message);
}

/** AI SDK LanguageModelUsage → 원장 필드. 캐시 토큰은 inputTokens 에 포함돼 오므로 분리한다. */
export function splitLanguageModelUsage(usage: {
  inputTokens?: number;
  outputTokens?: number;
  inputTokenDetails?: { cacheReadTokens?: number };
  outputTokenDetails?: { reasoningTokens?: number };
}) {
  const cached = usage.inputTokenDetails?.cacheReadTokens ?? 0;
  const input = Math.max(0, (usage.inputTokens ?? 0) - cached);
  const reasoning = usage.outputTokenDetails?.reasoningTokens ?? 0;
  // AI SDK outputTokens is the total, including reasoning; ledger fields are disjoint.
  const output = Math.max(0, (usage.outputTokens ?? 0) - reasoning);
  return { input, cached, output, reasoning };
}
