import { describe, expect, it } from "vitest";
import { costOfAudio, costOfEmbedding, costOfTokens } from "../pricing";
import { splitLanguageModelUsage } from "../usage";

describe("pricing", () => {
  it("prices luna tokens with cached discount", () => {
    // 2K 신규 입력 + 3K 캐시 + 400 출력 ≈ $0.00094
    expect(
      costOfTokens("openai/gpt-5.6-luna", {
        input: 2000,
        cached: 3000,
        output: 400,
      }),
    ).toBeCloseTo(0.00094, 6);
  });
  it("bills reasoning tokens as output", () => {
    expect(
      costOfTokens("openai/gpt-5.6-luna", {
        input: 0,
        cached: 0,
        output: 100,
        reasoning: 100,
      }),
    ).toBeCloseTo(0.00024, 6);
  });
  it("prices embeddings and audio", () => {
    expect(
      costOfEmbedding("openai/text-embedding-3-small", 300_000),
    ).toBeCloseTo(0.006, 6);
    expect(costOfAudio("meta/muse-voice-transcribe-1.0", 3600)).toBeCloseTo(
      0.18,
      6,
    );
    expect(costOfAudio("meta/muse-voice-transcribe-1.0", 59.9)).toBeCloseTo(
      0.00295,
      6,
    );
  });
  it("returns 0 for unknown models", () => {
    expect(costOfTokens("x/y", { input: 1, cached: 0, output: 1 })).toBe(0);
  });
});

describe("splitLanguageModelUsage", () => {
  it("separates cached tokens from input", () => {
    expect(
      splitLanguageModelUsage({
        inputTokens: 5000,
        outputTokens: 400,
        inputTokenDetails: { cacheReadTokens: 3000 },
        outputTokenDetails: { reasoningTokens: 50 },
      }),
    ).toEqual({ input: 2000, cached: 3000, output: 350, reasoning: 50 });
  });
  it("charges total completion tokens once when the SDK includes reasoning", () => {
    const usage = splitLanguageModelUsage({
      outputTokens: 400,
      outputTokenDetails: { reasoningTokens: 50 },
    });
    expect(usage.output + usage.reasoning).toBe(400);
    expect(costOfTokens("openai/gpt-5.6-luna", usage)).toBeCloseTo(0.00048, 6);
  });
});
