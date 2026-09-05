import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db, ServiceContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { calendarRepository } from "@/modules/calendar/repository";
import { tasksService } from "@/modules/tasks/service";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import {
  calendarWeekly,
  captureWeekly,
  meetingsWeekly,
  overdueStats,
  slotHeat,
  streak,
  tasksWeekly,
  weeksIn,
} from "../metrics";
import { getOrCreateWeeklyReview } from "../review";

const generate = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ text: "검증 리뷰" }),
);
vi.mock("@/core/llm/client", () => ({ llmGenerate: generate }));
const available = await localSupabaseAvailable();
const range = {
  from: new Date("2026-08-31T07:00:00Z"),
  to: new Date("2026-09-07T07:00:00Z"),
};
function failRead(db: Db, table: string): Db {
  const failed: unknown = new Proxy(
    {},
    {
      get: (_, key) =>
        key === "then"
          ? (resolve: (r: unknown) => void) =>
              resolve({ data: null, error: { message: "metrics unavailable" } })
          : () => failed,
    },
  );
  return new Proxy(db, {
    get(target, key) {
      if (key !== "from") return Reflect.get(target, key);
      return (name: string) =>
        name === table ? failed : target.from(name as "profiles");
    },
  });
}
it("includes an in-progress Monday but excludes an exact next-week boundary", () => {
  expect(
    weeksIn(
      {
        from: new Date("2026-09-07T07:00:00Z"),
        to: new Date("2026-09-07T08:00:00Z"),
      },
      "America/Los_Angeles",
    ),
  ).toEqual(["2026-09-07"]);
  expect(weeksIn(range, "America/Los_Angeles")).toEqual(["2026-08-31"]);
});
describe.skipIf(!available)("canonical, reliable insight metrics", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let ctx: ServiceContext;
  beforeAll(async () => {
    user = await testUser("metrics");
    ctx = {
      db: user.db,
      userId: user.id,
      actor: "user",
      timezone: "Asia/Seoul",
      now: new Date("2026-09-07T01:00:00Z"),
      registry: createRegistry(() => []),
      emit: async () => {},
      enqueue: async () => "job",
    };
    const profile = await user.db
      .from("profiles")
      .update({ timezone: "America/Los_Angeles" })
      .eq("id", user.id);
    if (profile.error) throw profile.error;
    const card = await tasksService(ctx).createCard({ title: "일요일 완료" });
    const updated = await user.db
      .from("cards")
      .update({
        created_at: "2026-09-06T23:00:00Z",
        completed_at: "2026-09-07T00:00:00Z",
      })
      .eq("id", card.id);
    if (updated.error) throw updated.error;
    const capture = await user.db.from("captures").insert({
      user_id: user.id,
      raw_text: "일요일 캡처",
      status: "resolved",
      created_at: "2026-09-07T00:00:00Z",
    });
    if (capture.error) throw capture.error;
    const meeting = await user.db.from("meetings").insert({
      user_id: user.id,
      title: "일요일 회의",
      started_at: "2026-09-07T00:00:00Z",
      duration_sec: 3600,
      status: "ready",
    });
    if (meeting.error) throw meeting.error;
    const repo = calendarRepository(user.db, user.id);
    const integration = await repo.upsertIntegration({
      account_email: user.email,
      scopes: [],
      status: "connected",
    });
    const calendars = await repo.upsertCalendars([
      {
        integration_id: integration.id,
        external_id: "primary",
        name: "테스트",
        color: null,
        selected: true,
        writable: true,
        is_primary: true,
      },
    ]);
    const cal = calendars[0];
    if (!cal) throw new Error("missing calendar");
    await repo.insertEvent({
      calendar_id: cal.id,
      external_id: "metrics-event",
      title: "일요일 일정",
      start_at: "2026-09-07T00:00:00Z",
      end_at: "2026-09-07T01:00:00Z",
      all_day: false,
    });
  });
  afterAll(async () => user?.cleanup());
  it("aggregates every weekly and hourly metric in the profile timezone at a Sunday/Monday boundary", async () => {
    const tasks = await tasksWeekly(ctx, range);
    expect(tasks.weekly).toEqual([
      { week: "2026-08-31", created: 1, completed: 1 },
    ]);
    expect(tasks.cycle).toEqual([
      { week: "2026-08-31", completed: 1, avgHours: 1, medianHours: 1 },
    ]);
    expect(await meetingsWeekly(ctx, range)).toEqual([
      { week: "2026-08-31", meetings: 1, minutes: 60 },
    ]);
    expect(await calendarWeekly(ctx, range)).toEqual([
      { week: "2026-08-31", events: 1, hours: 1 },
    ]);
    expect(await captureWeekly(ctx, range)).toEqual([
      { week: "2026-08-31", captured: 1, resolved: 1, dismissed: 0 },
    ]);
    expect(await streak(ctx)).toEqual({ current: 1, activeDays30: 1 });
    const heat = await slotHeat(ctx, range);
    expect(heat[6]?.[17]).toBe(1);
    expect(heat[0]?.[9]).toBe(0);
  });
  it.each([
    ["v_tasks_weekly", tasksWeekly],
    ["v_task_cycle_time", tasksWeekly],
    ["v_meetings_weekly", meetingsWeekly],
    ["v_calendar_load_weekly", calendarWeekly],
    ["v_capture_conversion", captureWeekly],
    ["v_completion_days", streak],
    ["cards", overdueStats],
    ["v_event_slots", slotHeat],
  ] as const)("propagates %s read failure instead of returning zero facts", async (table, metric) => {
    await expect(
      metric({ ...ctx, db: failRead(user.db, table) }, range),
    ).rejects.toThrow("metrics unavailable");
  });
  it("does not generate or persist a weekly review from failed reads, and uses canonical week for successful reviews", async () => {
    generate.mockClear();
    await expect(
      getOrCreateWeeklyReview(
        { ...ctx, db: failRead(user.db, "v_tasks_weekly") },
        { force: true },
      ),
    ).rejects.toThrow("metrics unavailable");
    expect(generate).not.toHaveBeenCalled();
    expect(
      (await user.db.from("insights").select("id").eq("user_id", user.id)).data,
    ).toEqual([]);
    const review = await getOrCreateWeeklyReview(ctx, { force: true });
    expect(review.period_start).toBe("2026-08-31");
    expect(
      (generate.mock.calls[0]?.[0] as { prompt: string }).prompt,
    ).toContain("이번 주 생성 1 · 완료 1");
    expect(generate).toHaveBeenCalledOnce();
  });
});
