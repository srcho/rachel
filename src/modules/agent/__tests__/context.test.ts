import { describe, expect, it } from "vitest";
import type { RachelModule, ToolContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import {
  buildDynamicContext,
  estimateTokens,
  truncateToTokens,
} from "../context";

const ctx = {
  userId: "u",
  timezone: "Asia/Seoul",
  now: new Date("2026-09-03T01:00:00Z"),
  ui: { route: "/tasks/abc" },
  registry: createRegistry(() => []),
} as ToolContext;

describe("agent context", () => {
  it("estimates korean heavier than english", () => {
    expect(estimateTokens("안녕하세요")).toBe(5);
    expect(estimateTokens("hello world!")).toBe(3);
  });
  it("truncates by lines within budget", () => {
    const text = Array.from(
      { length: 50 },
      (_, i) => `줄 ${i} 가나다라마바사`,
    ).join("\n");
    const t = truncateToTokens(text, 60);
    expect(t.endsWith("…(생략)")).toBe(true);
    expect(estimateTokens(t)).toBeLessThan(80);
  });
  it("assembles time, screen and provider blocks respecting budgets", async () => {
    const mod: RachelModule = {
      manifest: { id: "m", name: "m", icon: "x", schemaVersion: 1 },
      contextProviders: [
        {
          id: "a",
          budgetTokens: 20,
          build: async () =>
            "[A]\n가나다라마바사아자차카타파하가나다라마바사아자차카타파하가나다라마바사",
        },
        { id: "b", budgetTokens: 100, build: async () => null },
        {
          id: "c",
          budgetTokens: 100,
          build: async () => {
            throw new Error("boom");
          },
        },
        { id: "d", budgetTokens: 100, build: async () => "[D] ok" },
      ],
    };
    const out = await buildDynamicContext(
      ctx,
      createRegistry(() => [mod]),
      "q",
    );
    expect(out).toContain("[지금]");
    expect(out).toContain("[화면] /tasks/abc");
    expect(out).toContain("[D] ok");
    expect(out).toContain("…(생략)");
  });
});
