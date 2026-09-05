import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ServiceContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { localSupabaseAvailable, testUser } from "@/test/supabase";

const send = vi.hoisted(() => vi.fn(async () => ({ sent: 1, removed: 0 })));
vi.mock("../service", () => ({ notifyService: () => ({ send }) }));

import {
  afterQuietHours,
  reminderJob,
  scheduleReminders,
  shouldNotifyEvent,
} from "../reminders";

it("defers overnight alerts to local quiet-hour end including DST", () => {
  expect(
    afterQuietHours(
      new Date("2026-09-04T14:00:00Z"),
      "Asia/Seoul",
      22,
      8,
    ).toISOString(),
  ).toBe("2026-09-04T23:00:00.000Z");
  expect(
    afterQuietHours(
      new Date("2026-03-08T06:30:00Z"),
      "America/New_York",
      22,
      8,
    ).toISOString(),
  ).toBe("2026-03-08T12:00:00.000Z");
  expect(shouldNotifyEvent(true, false)).toBe(false);
  expect(shouldNotifyEvent(false, false)).toBe(true);
});
const available = await localSupabaseAvailable();
describe.skipIf(!available)("scheduled reminders", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let ctx: ServiceContext;
  const queued: unknown[] = [];
  beforeAll(async () => {
    user = await testUser("reminders");
    ctx = {
      db: user.db,
      userId: user.id,
      actor: "system",
      now: new Date("2026-09-05T00:00:00Z"),
      timezone: "Asia/Seoul",
      registry: createRegistry(() => []),
      emit: async () => {},
      enqueue: async (job) => {
        queued.push(job);
        return "job";
      },
    };
  });
  afterAll(async () => user?.cleanup());
  it("schedules the next morning and ignores stale or nonexistent targets", async () => {
    await scheduleReminders(ctx);
    expect(queued).toContainEqual(
      expect.objectContaining({
        payload: { target: "morning", date: "2026-09-06" },
        runAt: new Date("2026-09-06T00:00:00Z"),
      }),
    );
    await reminderJob.run(
      { target: "card", id: crypto.randomUUID(), dueAt: ctx.now.toISOString() },
      ctx,
    );
    await reminderJob.run({ target: "morning", date: "2026-09-04" }, ctx);
    expect(send).not.toHaveBeenCalled();
  });
  it("does not reissue running or completed originals but retries failed scheduling", async () => {
    const key = "reminder:morning:2026-09-06:";
    const { data, error } = await user.db
      .from("jobs")
      .insert({
        user_id: user.id,
        type: "notify.reminder",
        dedupe_key: key,
        status: "running",
      })
      .select("id")
      .single();
    if (error || !data) throw error ?? new Error("missing job");
    queued.length = 0;
    await scheduleReminders(ctx);
    expect(queued).toEqual([]);
    await user.db.from("jobs").update({ status: "done" }).eq("id", data.id);
    await scheduleReminders(ctx);
    expect(queued).toEqual([]);
    await user.db.from("jobs").update({ status: "failed" }).eq("id", data.id);
    await scheduleReminders(ctx);
    expect(queued).toHaveLength(1);
  });
});
