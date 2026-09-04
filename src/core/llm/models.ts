import { createOpenAI } from "@ai-sdk/openai";
import { env } from "@/core/env";

/** 역할 → 모델 매핑. 모델 교체는 이 파일 한 곳에서. */
export type ReasoningEffort = "none" | "low" | "medium" | "high";

export const MODEL_IDS = {
  chat: "gpt-5.6-luna",
  extract: "gpt-5.6-luna",
  summarize: "gpt-5.6-luna",
  review: "gpt-5.6-luna",
  embed: "text-embedding-3-small",
} as const;

export const ROLE_REASONING: Record<
  Exclude<keyof typeof MODEL_IDS, "embed">,
  ReasoningEffort
> = {
  chat: "low",
  extract: "low",
  summarize: "medium",
  review: "medium",
};

export const TRANSCRIPTION = {
  provider: "meta" as const,
  model: "muse-voice-transcribe-1.0",
  sampleRate: 16_000,
  languageBias: ["Korean", "English"] as const,
  /** 배치 요청 한도 */
  maxSeconds: 600,
  maxBytes: 32 * 1024 * 1024,
};

export type TextRole = Exclude<keyof typeof MODEL_IDS, "embed">;

let openaiProvider: ReturnType<typeof createOpenAI> | undefined;
export function openai() {
  if (!openaiProvider)
    openaiProvider = createOpenAI({ apiKey: env().OPENAI_API_KEY });
  return openaiProvider;
}

export function textModel(role: TextRole) {
  return openai()(MODEL_IDS[role]);
}
export function embeddingModel() {
  return openai().embeddingModel(MODEL_IDS.embed);
}
