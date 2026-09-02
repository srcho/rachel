/**
 * 단가표. 기록 시점 단가를 llm_usage.unit_prices 에 스냅샷으로 남기므로 값이 바뀌어도 과거 원장은 유지된다.
 * 출처: OpenAI 모델 페이지(2026-09-02), Meta dev.meta.ai(2026-09-02)
 */
export interface TokenPricing {
  kind: "token";
  per: number; // 토큰 수 기준(1,000,000)
  input: number;
  cachedInput?: number;
  output: number;
}
export interface EmbeddingPricing {
  kind: "embedding";
  per: number;
  input: number;
}
export interface AudioPricing {
  kind: "audio";
  perHour: number;
}
export type Pricing = TokenPricing | EmbeddingPricing | AudioPricing;

export const PRICING = {
  "openai/gpt-5.6-luna": {
    kind: "token",
    per: 1_000_000,
    input: 0.2,
    cachedInput: 0.02,
    output: 1.2,
  },
  "openai/text-embedding-3-small": {
    kind: "embedding",
    per: 1_000_000,
    input: 0.02,
  },
  "meta/muse-voice-transcribe-1.0": { kind: "audio", perHour: 0.18 },
} as const satisfies Record<string, Pricing>;

export type PricedModel = keyof typeof PRICING;

export interface TokenUsage {
  input: number;
  cached: number;
  output: number;
  /** 추론 토큰은 출력 단가로 과금된다(output 에 이미 포함된 경우 0으로 넘긴다) */
  reasoning?: number;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export function pricingFor(model: string): Pricing | undefined {
  return (PRICING as Record<string, Pricing>)[model];
}

/** 토큰 사용량 → USD. 캐시 토큰은 input 에서 제외된 별도 수량으로 본다. */
export function costOfTokens(model: string, usage: TokenUsage): number {
  const p = pricingFor(model);
  if (!p || p.kind !== "token") return 0;
  const cachedRate = p.cachedInput ?? p.input;
  const out = usage.output + (usage.reasoning ?? 0);
  return round6(
    (usage.input * p.input + usage.cached * cachedRate + out * p.output) /
      p.per,
  );
}

export function costOfEmbedding(model: string, tokens: number): number {
  const p = pricingFor(model);
  if (!p || p.kind !== "embedding") return 0;
  return round6((tokens * p.input) / p.per);
}

/** 오디오 초 → USD. Meta 는 초 단위 내림 과금. */
export function costOfAudio(model: string, seconds: number): number {
  const p = pricingFor(model);
  if (!p || p.kind !== "audio") return 0;
  return round6((Math.floor(seconds) / 3600) * p.perHour);
}
