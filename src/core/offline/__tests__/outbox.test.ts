// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearOutbox,
  enqueueOutbox,
  isNetworkError,
  outboxCount,
  registerOutboxHandler,
  replayOutbox,
  runOrQueue,
  setOutboxUser,
} from "../outbox";

describe("outbox", () => {
  beforeEach(async () => {
    setOutboxUser("test-user");
    await clearOutbox();
  });

  it("classifies network errors", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new Error("카드를 찾을 수 없어요"))).toBe(false);
  });

  it("queues on network failure and replays in order; preserves server-rejected items and their successors", async () => {
    const calls: string[] = [];
    registerOutboxHandler("t.ok", async (x) => {
      calls.push(`ok:${x}`);
    });
    registerOutboxHandler("t.bad", async () => {
      throw new Error("server says no");
    });
    const r1 = await runOrQueue("t.ok", ["a"], async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(r1.queued).toBe(true);
    await enqueueOutbox("t.bad", []);
    await enqueueOutbox("t.ok", ["b"]);
    expect(await outboxCount()).toBe(3);
    const r = await replayOutbox();
    expect(r).toEqual({ done: 1, failed: 1, remaining: 2 });
    expect(calls).toEqual(["ok:a"]);
  });

  it("preserves actions whose module has not registered and retries once available", async () => {
    await enqueueOutbox("t.late", ["saved draft"]);
    expect((await replayOutbox()).remaining).toBe(1);
    const handler = vi.fn(async () => undefined);
    registerOutboxHandler("t.late", handler);
    expect((await replayOutbox()).done).toBe(1);
    expect(handler).toHaveBeenCalledWith("saved draft");
  });
  it("never replays another user's queued creation", async () => {
    const handler = vi.fn(async () => undefined);
    registerOutboxHandler("t.owner", handler);
    await enqueueOutbox("t.owner", []);
    setOutboxUser("other-user");
    expect((await replayOutbox()).done).toBe(0);
    expect(handler).not.toHaveBeenCalled();
    setOutboxUser("test-user");
    expect((await replayOutbox()).done).toBe(1);
  });

  it("stops replaying when still offline", async () => {
    let n = 0;
    registerOutboxHandler("t.net", async () => {
      n++;
      throw new TypeError("Failed to fetch");
    });
    await enqueueOutbox("t.net", []);
    await enqueueOutbox("t.net", []);
    const r = await replayOutbox();
    expect(n).toBe(1);
    expect(r.remaining).toBe(2);
    vi.restoreAllMocks();
  });
});
