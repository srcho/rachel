import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ServiceContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { calendarRepository } from "../repository";
import { maybeTriggerSync } from "../trigger";

// after() must use the captured session, without any request-time API access.
vi.mock("@/core/db/server", () => ({
  createServerSupabase: () => {
    throw new Error("cookies unavailable after render");
  },
}));
const available = await localSupabaseAvailable();
describe.skipIf(!available)("calendar entry sync", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let ctx: ServiceContext;
  const enqueue = vi.fn(async () => "job");
  beforeAll(async () => {
    user = await testUser("sync-entry");
    ctx = {
      db: user.db,
      userId: user.id,
      actor: "system",
      now: new Date(),
      timezone: "Asia/Seoul",
      registry: createRegistry(() => []),
      emit: async () => {},
      enqueue,
    };
    await calendarRepository(user.db, user.id).upsertIntegration({
      account_email: user.email,
      scopes: [],
      status: "connected",
    });
  });
  afterAll(async () => user?.cleanup());
  it("enqueues stale calendars with the captured RLS client and deduplicates entry", async () => {
    await maybeTriggerSync(ctx);
    await maybeTriggerSync(ctx);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith({
      type: "calendar.sync",
      payload: {},
      dedupeKey: `calendar.sync:${user.id}`,
    });
  });
  it("does not enqueue fresh calendars", async () => {
    await calendarRepository(user.db, user.id).upsertIntegration({
      account_email: user.email,
      scopes: [],
      status: "connected",
    });
    const { error } = await user.db
      .from("integrations")
      .update({
        last_synced_at: new Date(ctx.now.getTime() + 120_000).toISOString(),
      })
      .eq("user_id", user.id);
    if (error) throw error;
    await maybeTriggerSync({
      ...ctx,
      now: new Date(ctx.now.getTime() + 120_000),
    });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
