import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localSupabaseAvailable, testUser } from "@/test/supabase";

const available = await localSupabaseAvailable();
describe.skipIf(!available)("atomic enqueue_job", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let other: Awaited<ReturnType<typeof testUser>>;
  beforeAll(async () => {
    user = await testUser("queue");
    other = await testUser("queue-other");
  });
  afterAll(async () => {
    await user?.cleanup();
    await other?.cleanup();
  });
  it("coalesces concurrent pending jobs, preserves the original payload and isolates users", async () => {
    const key = `queue-test:${crypto.randomUUID()}`;
    const enqueue = (u = user, n = 0) =>
      u.db.rpc("enqueue_job", {
        p_type: "notify.reminder",
        p_user_id: u.id,
        p_dedupe_key: key,
        p_payload: { n },
      });
    const first = await enqueue();
    expect(first.error).toBeNull();
    if (!first.data) throw new Error("missing enqueued job");
    const concurrent = await Promise.all(
      Array.from({ length: 12 }, (_, i) => enqueue(user, i + 1)),
    );
    expect(
      concurrent.every((r) => r.error === null && r.data === first.data),
    ).toBe(true);
    const row = await user.db
      .from("jobs")
      .select("payload")
      .eq("id", first.data)
      .single();
    expect(row.data?.payload).toEqual({ n: 0 });
    const isolated = await enqueue(other);
    expect(isolated.error).toBeNull();
    expect(isolated.data).not.toBe(first.data);
    expect(
      (
        await user.db
          .from("jobs")
          .update({ status: "running" })
          .eq("id", first.data)
      ).error,
    ).toBeNull();
    const next = await enqueue(user, 99);
    expect(next.error).toBeNull();
    expect(next.data).not.toBe(first.data);
    expect(
      (
        await user.db
          .from("jobs")
          .update({ status: "done" })
          .eq("id", first.data)
      ).error,
    ).toBeNull();
    expect((await enqueue()).data).toBe(next.data);
  });
});
