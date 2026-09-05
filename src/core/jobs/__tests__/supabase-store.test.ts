import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { JobRecord, ServiceContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { runJobs } from "../runner";
import { createSupabaseJobStore } from "../supabase-store";

const available = await localSupabaseAvailable();
describe.skipIf(!available)("job claim release", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  beforeEach(async () => {
    user = await testUser("job-release");
  });
  afterEach(async () => user?.cleanup());
  async function job(status: "running" | "pending", key?: string) {
    const { data, error } = await user.db
      .from("jobs")
      .insert({
        user_id: user.id,
        type: "test.echo",
        status,
        dedupe_key: key,
        attempts: status === "running" ? 3 : 0,
        locked_at: status === "running" ? "2026-09-05T01:00:00Z" : null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return { ...data, status };
  }
  async function get(id: string) {
    const { data, error } = await user.db
      .from("jobs")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  }
  it("refunds an unstarted attempt only for the current claim", async () => {
    const current = await job("running");
    const store = createSupabaseJobStore(user.db);
    await store.defer(current, new Date());
    expect(await get(current.id)).toMatchObject({
      status: "pending",
      attempts: 2,
      locked_at: null,
    });
    const stale = await job("running");
    const { error } = await user.db
      .from("jobs")
      .update({ attempts: 4, locked_at: "2026-09-05T02:00:00Z" })
      .eq("id", stale.id);
    if (error) throw error;
    await store.defer(stale, new Date());
    expect(await get(stale.id)).toMatchObject({
      status: "running",
      attempts: 4,
    });
  });
  it("preserves a newer pending replacement when an unstarted claim is deferred", async () => {
    const current = await job("running", "same");
    const replacement = await job("pending", "same");
    await createSupabaseJobStore(user.db).defer(current, new Date());
    expect(await get(current.id)).toMatchObject({
      status: "failed",
      attempts: 2,
    });
    expect(await get(replacement.id)).toMatchObject({
      status: "pending",
      attempts: 0,
    });
  });
  it("continues the batch after a retry collides with a newer pending replacement", async () => {
    const current = await job("running", "same");
    const replacement = await job("pending", "same");
    const next = await job("running");
    let count = 0;
    const store = createSupabaseJobStore(user.db);
    const stats = await runJobs({
      store: {
        ...store,
        claim: async () => [current, next] as JobRecord[],
      },
      registry: createRegistry(() => [
        {
          manifest: { id: "test", name: "test", icon: "x", schemaVersion: 1 },
          jobs: {
            echo: {
              schema: z.object({}),
              timeoutSec: 1,
              maxAttempts: 4,
              run: async () => {
                if (count++ === 0) throw new Error("temporary");
              },
            },
          },
        },
      ]),
      contextFor: () => ({}) as ServiceContext,
    });
    expect(stats).toMatchObject({ done: 1, retried: 1 });
    expect((await get(current.id)).status).toBe("failed");
    expect((await get(next.id)).status).toBe("done");
    expect(await get(replacement.id)).toMatchObject({
      status: "pending",
      attempts: 0,
    });
  });
});
