import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { JobRecord, RachelModule, ServiceContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { backoffMinutes, type JobStore, runJobs } from "../runner";

function makeJob(partial: Partial<JobRecord>): JobRecord {
  return {
    id: "j1",
    user_id: "u1",
    type: "hello.echo",
    payload: { text: "hi" },
    dedupe_key: null,
    status: "running",
    run_at: new Date().toISOString(),
    attempts: 1,
    max_attempts: 3,
    locked_at: null,
    last_error: null,
    ...partial,
  };
}

function makeStore(jobs: JobRecord[]) {
  const calls: string[] = [];
  const store: JobStore = {
    claim: async () => jobs,
    defer: async (job) => {
      calls.push(`defer:${job.id}`);
    },
    complete: async (id) => {
      calls.push(`done:${id}`);
    },
    fail: async (id, err, retryAt) => {
      calls.push(`${retryAt ? "retry" : "fail"}:${id}:${err}`);
    },
  };
  return { store, calls };
}

const ctx = {} as ServiceContext;

describe("runJobs", () => {
  it("dispatches to the handler and completes", async () => {
    const run = vi.fn(async () => {});
    const mod: RachelModule = {
      manifest: { id: "hello", name: "h", icon: "x", schemaVersion: 1 },
      jobs: { echo: { schema: z.object({ text: z.string() }), run } },
    };
    const { store, calls } = makeStore([makeJob({})]);
    const stats = await runJobs({
      store,
      registry: createRegistry(() => [mod]),
      contextFor: () => ctx,
    });
    expect(run).toHaveBeenCalledWith({ text: "hi" }, ctx);
    expect(calls).toEqual(["done:j1"]);
    expect(stats).toEqual({ claimed: 1, done: 1, failed: 0, retried: 0 });
  });

  it("retries with backoff until max attempts, then fails", async () => {
    const mod: RachelModule = {
      manifest: { id: "hello", name: "h", icon: "x", schemaVersion: 1 },
      jobs: {
        echo: {
          schema: z.object({}),
          run: async () => {
            throw new Error("boom");
          },
        },
      },
    };
    const { store, calls } = makeStore([
      makeJob({ id: "a", attempts: 1 }),
      makeJob({ id: "b", attempts: 3 }),
    ]);
    const stats = await runJobs({
      store,
      registry: createRegistry(() => [mod]),
      contextFor: () => ctx,
    });
    expect(calls).toEqual(["retry:a:boom", "fail:b:boom"]);
    expect(stats).toEqual({ claimed: 2, done: 0, failed: 1, retried: 1 });
  });

  it("fails jobs with no handler or invalid payload", async () => {
    const mod: RachelModule = {
      manifest: { id: "hello", name: "h", icon: "x", schemaVersion: 1 },
      jobs: {
        echo: { schema: z.object({ text: z.string() }), run: async () => {} },
      },
    };
    const { store, calls } = makeStore([
      makeJob({ id: "x", type: "nope.job" }),
      makeJob({ id: "y", payload: { text: 1 }, attempts: 3 }),
    ]);
    await runJobs({
      store,
      registry: createRegistry(() => [mod]),
      contextFor: () => ctx,
    });
    expect(calls[0]).toBe("fail:x:핸들러 없음: nope.job");
    expect(calls[1]?.startsWith("fail:y:")).toBe(true);
  });

  it("reserves the next handler timeout and completion time instead of exceeding the invocation budget", async () => {
    let elapsed = 0;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => elapsed);
    const run = vi.fn(async () => {
      elapsed += 170_000;
    });
    const mod: RachelModule = {
      manifest: { id: "hello", name: "h", icon: "x", schemaVersion: 1 },
      jobs: { echo: { schema: z.object({}), timeoutSec: 180, run } },
    };
    const { store, calls } = makeStore([
      makeJob({ id: "a" }),
      makeJob({ id: "b", attempts: 3 }),
    ]);
    try {
      const stats = await runJobs({
        store,
        registry: createRegistry(() => [mod]),
        contextFor: () => ctx,
        budgetMs: 250_000,
      });
      expect(run).toHaveBeenCalledTimes(1);
      expect(calls).toEqual(["done:a", "defer:b"]);
      expect(stats).toMatchObject({ done: 1, retried: 1, failed: 0 });
    } finally {
      clock.mockRestore();
    }
  });

  it("backoff doubles per attempt", () => {
    expect([1, 2, 3].map(backoffMinutes)).toEqual([2, 4, 8]);
  });
});
