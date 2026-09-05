import { beforeEach, describe, expect, it, vi } from "vitest";
import { costOfTokens } from "@/core/llm/pricing";
import type { UsageRecordInput } from "@/core/llm/usage";
import type { ChatMetadata } from "../agent";

type Message = {
  id: string;
  role: "user" | "assistant";
  parts: Array<{ type: "text"; text: string }>;
  metadata?: ChatMetadata;
};
type StepUsage = {
  inputTokens: number;
  outputTokens: number;
  inputTokenDetails?: { cacheReadTokens: number };
  outputTokenDetails?: { reasoningTokens: number };
};
type StreamOptions = {
  abortSignal: AbortSignal;
  generateMessageId: () => string;
  onStepFinish: (step: {
    usage: StepUsage;
    finishReason: string;
  }) => Promise<void>;
  messageMetadata: (event: {
    part: { type: string };
  }) => ChatMetadata | undefined;
  onFinish: (event: {
    messages: Message[];
    isAborted: boolean;
  }) => Promise<void>;
};
const mocks = vi.hoisted(() => ({
  stream: vi.fn<(options: StreamOptions) => Response>(),
  agent:
    vi.fn<
      (input: {
        shouldStop: () => boolean;
        turnKey: string;
        retry?: boolean;
      }) => Promise<object>
    >(),
  budget: vi.fn(),
  receipts: vi.fn(),
  emit: vi.fn(),
  save: vi.fn<(threadId: string, messages: Message[]) => Promise<void>>(),
  ensure: vi.fn(),
  load: vi.fn(),
  getThread: vi.fn(),
  record:
    vi.fn<
      (db: unknown, userId: string, usage: UsageRecordInput) => Promise<void>
    >(),
}));
vi.mock("ai", () => ({ createAgentUIStreamResponse: mocks.stream }));
vi.mock("@/core/auth/session", () => ({
  requireUser: async () => ({ id: "local-user" }),
}));
vi.mock("@/core/db/server", () => ({ createServerSupabase: async () => ({}) }));
vi.mock("@/core/context", () => ({
  createContext: () => ({
    userId: "local-user",
    now: new Date(),
    timezone: "Asia/Seoul",
    emit: mocks.emit,
  }),
}));
vi.mock("@/core/env", () => ({
  requireEnv: () => "local-test-signing-secret",
}));
vi.mock("@/core/llm/budget", () => ({ budgetStatus: mocks.budget }));
vi.mock("@/core/llm/models", () => ({ MODEL_IDS: { chat: "gpt-5.6-luna" } }));
vi.mock("@/core/llm/usage", async (original) => ({
  ...(await original<typeof import("@/core/llm/usage")>()),
  recordUsage: mocks.record,
}));
vi.mock("@/core/settings/assistant", () => ({
  getUserTimezone: async () => "Asia/Seoul",
}));
vi.mock("@/modules", () => ({ registry: {} }));
vi.mock("../agent", () => ({ createRachelAgent: mocks.agent, MAX_STEPS: 6 }));
vi.mock("../execution", () => ({ executionStatusSummary: mocks.receipts }));
vi.mock("../service", () => ({
  agentService: () => ({
    ensureThread: mocks.ensure,
    loadMessages: mocks.load,
    saveMessages: mocks.save,
    getThread: mocks.getThread,
  }),
}));
vi.mock("../settings", () => ({ getHonorific: async () => "테스터님" }));

import { POST } from "@/app/api/chat/route";

const threadId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const user: Message = {
  id: "budget-turn",
  role: "user",
  parts: [{ type: "text", text: "여섯 단계 작업을 처리해 줘" }],
};
const usage: StepUsage = {
  inputTokens: 1000,
  outputTokens: 200,
  inputTokenDetails: { cacheReadTokens: 100 },
  outputTokenDetails: { reasoningTokens: 50 },
};
const request = (signal?: AbortSignal) =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify({ id: threadId, messages: [user] }),
    signal,
  });
const options = () => {
  const value = mocks.stream.mock.calls[0]?.[0];
  if (!value) throw new Error("stream boundary was not reached");
  return value;
};
const agentInput = () => {
  const value = mocks.agent.mock.calls[0]?.[0];
  if (!value) throw new Error("agent boundary was not reached");
  return value;
};
const responseMessages = (): Message[] => [
  user,
  {
    id: options().generateMessageId(),
    role: "assistant",
    parts: [{ type: "text", text: "완료한 변경과 남은 작업을 확인해 주세요." }],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.stream.mockReturnValue(new Response("mock stream"));
  mocks.agent.mockResolvedValue({});
  mocks.budget.mockResolvedValue({ level: "ok", budgetUsd: null, spentUsd: 0 });
  mocks.load.mockResolvedValue([]);
  mocks.ensure.mockResolvedValue({ id: threadId });
  mocks.getThread.mockResolvedValue({ id: threadId });
  mocks.save.mockResolvedValue(undefined);
  mocks.record.mockResolvedValue(undefined);
  mocks.emit.mockResolvedValue(undefined);
  mocks.receipts.mockResolvedValue({
    total: 3,
    done: 2,
    unfinished: [{ id: "uncertain-run", status: "uncertain" }],
  });
});

describe("A36 chat route persistence and stop metadata at a mocked provider boundary", () => {
  it("returns budget-over 429 before constructing the agent or starting a provider stream", async () => {
    mocks.budget.mockResolvedValue({
      level: "over",
      budgetUsd: 1,
      spentUsd: 1,
    });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("완료된 변경은 유지"),
    });
    expect(mocks.agent).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(threadId, [user]);
  });

  it("updates the live shouldStop predicate as step usage crosses the remaining budget", async () => {
    const stepCost = costOfTokens("openai/gpt-5.6-luna", {
      input: 900,
      cached: 100,
      output: 150,
      reasoning: 50,
    });
    expect(stepCost).toBeGreaterThan(0);
    mocks.budget.mockResolvedValue({
      level: "ok",
      budgetUsd: stepCost * 1.5,
      spentUsd: 0,
    });
    await POST(request());
    expect(agentInput().shouldStop()).toBe(false);
    await options().onStepFinish({ usage, finishReason: "tool-calls" });
    expect(agentInput().shouldStop()).toBe(false);
    await options().onStepFinish({ usage, finishReason: "tool-calls" });
    expect(agentInput().shouldStop()).toBe(true);
    const metadata = options().messageMetadata({ part: { type: "finish" } });
    expect(metadata).toMatchObject({
      stopReason: "budget",
      inputTokens: 2000,
      cachedTokens: 200,
      outputTokens: 400,
    });
    expect(metadata?.costUsd).toBeCloseTo(stepCost * 2);
    expect(mocks.receipts).toHaveBeenLastCalledWith(
      expect.anything(),
      `${threadId}:${user.id}`,
    );
  });

  it("marks the sixth forced-summary step as step_limit even when the final model finish reason is stop", async () => {
    await POST(request());
    for (let i = 0; i < 5; i++)
      await options().onStepFinish({ usage, finishReason: "tool-calls" });
    expect(
      options().messageMetadata({ part: { type: "finish" } })?.stopReason,
    ).toBeUndefined();
    await options().onStepFinish({ usage, finishReason: "stop" });
    expect(
      options().messageMetadata({ part: { type: "finish" } }),
    ).toMatchObject({
      stopReason: "step_limit",
      execution: { total: 3, done: 2, unfinished: 1 },
    });
    const messages = responseMessages();
    await options().onFinish({ messages, isAborted: false });
    expect(messages[1]?.metadata?.stopReason).toBe("step_limit");
    expect(mocks.record).toHaveBeenCalledWith(
      expect.anything(),
      "local-user",
      expect.objectContaining({
        meta: expect.objectContaining({ steps: 6, stopReason: "step_limit" }),
      }),
    );
  });

  it("persists an interrupted assistant response with previously observed execution counts and incurred usage", async () => {
    const controller = new AbortController();
    const req = request(controller.signal);
    await POST(req);
    expect(options().abortSignal).toBe(req.signal);
    await options().onStepFinish({ usage, finishReason: "tool-calls" });
    controller.abort();
    expect(options().abortSignal.aborted).toBe(true);
    const messages = responseMessages();
    await options().onFinish({ messages, isAborted: true });
    expect(mocks.save).toHaveBeenLastCalledWith(threadId, messages);
    expect(messages[1]?.metadata).toMatchObject({
      stopReason: "interrupted",
      execution: { total: 3, done: 2, unfinished: 1 },
    });
    expect(mocks.record).toHaveBeenCalledWith(
      expect.anything(),
      "local-user",
      expect.objectContaining({
        inputTokens: 900,
        cachedTokens: 100,
        outputTokens: 150,
        reasoningTokens: 50,
        meta: expect.objectContaining({
          stopReason: "interrupted",
          execution: { total: 3, done: 2, unfinished: 1 },
        }),
      }),
    );
  });

  it("does not recreate message history or emit completion after the current thread was deleted, while retaining usage", async () => {
    await POST(request());
    await options().onStepFinish({ usage, finishReason: "tool-calls" });
    mocks.getThread.mockResolvedValue(null);
    await options().onFinish({
      messages: responseMessages(),
      isAborted: false,
    });
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(threadId, [user]);
    expect(mocks.ensure).toHaveBeenCalledExactlyOnceWith(threadId);
    expect(mocks.emit).not.toHaveBeenCalled();
    expect(mocks.record).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      "local-user",
      expect.objectContaining({
        ref: { type: "thread", id: threadId },
        inputTokens: 900,
      }),
    );
  });
});
