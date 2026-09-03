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
} from "../outbox";

describe("outbox", () => {
  beforeEach(async () => {
    await clearOutbox();
  });

  it("classifies network errors", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new Error("카드를 찾을 수 없어요"))).toBe(false);
  });

  it("queues on network failure and replays in order; drops server-rejected items", async () => {
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
    expect(r).toEqual({ done: 2, dropped: 1, remaining: 0 });
    expect(calls).toEqual(["ok:a", "ok:b"]);
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
