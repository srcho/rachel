import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ServiceContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { runToolOnce } from "@/modules/agent/tool-once";
import { calendarRepository } from "@/modules/calendar/repository";
import { tasksService } from "@/modules/tasks/service";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { getTodayPlan, remainingCapacity } from "../today-plan";
import { insightsTools } from "../tools";

const generate = vi.hoisted(() =>
  vi.fn(async () => ({ text: "오늘 계획을 먼저 살펴봐요." })),
);
vi.mock("@/core/llm/client", () => ({ llmGenerate: generate }));

it("unions overlapping busy appointments and ignores free/cancelled events", () => {
  const event = (
    start: string,
    end: string,
    is_busy = true,
    status = "confirmed",
  ) => ({
    start_at: `2026-09-07T${start}:00Z`,
    end_at: `2026-09-07T${end}:00Z`,
    is_busy,
    status,
  });
  expect(
    remainingCapacity(
      Date.parse("2026-09-07T09:00:00Z"),
      Date.parse("2026-09-07T12:00:00Z"),
      [
        event("09:00", "10:00"),
        event("09:30", "10:30"),
        event("11:00", "12:00", false),
        event("11:00", "12:00", true, "cancelled"),
      ],
    ),
  ).toBe(90);
});
it("classifies generation as a side effect for the turn execution ledger", () => {
  expect(insightsTools.generateBrief?.risk).toBe("write");
  expect(insightsTools.weeklyReview?.risk).toBe("write");
  expect(insightsTools.todayPlan?.risk).toBe("read");
});
const available = await localSupabaseAvailable();
describe.skipIf(!available)("today planning (local isolated Supabase)", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let ctx: ServiceContext;
  let calendarId: string;
  beforeAll(async () => {
    user = await testUser("today-plan");
    ctx = {
      userId: user.id,
      db: user.db,
      actor: "user",
      now: new Date("2026-09-07T00:00:00Z"),
      timezone: "Asia/Seoul",
      registry: createRegistry(() => []),
      emit: async () => {},
      enqueue: async () => "",
    };
    const repo = calendarRepository(user.db, user.id);
    const integration = await repo.upsertIntegration({
      account_email: user.email,
      status: "connected",
      scopes: [],
    });
    const calendars = await repo.upsertCalendars([
      {
        integration_id: integration.id,
        external_id: "primary",
        name: "기본",
        selected: true,
        writable: true,
        is_primary: true,
        color: null,
      },
    ]);
    const calendar = calendars[0];
    if (!calendar) throw new Error("calendar missing");
    calendarId = calendar.id;
    await repo.updateCalendar(calendarId, {
      last_synced_at: ctx.now.toISOString(),
      sync_coverage_from: "2026-09-06T00:00:00Z",
      sync_coverage_to: "2026-09-08T00:00:00Z",
    });
    const { error } = await user.db
      .from("profiles")
      .update({
        settings: {
          assistant: { scheduling: { workStartHour: 9, workEndHour: 12 } },
        },
      })
      .eq("id", user.id);
    if (error) throw error;
    await repo.insertEvent({
      calendar_id: calendarId,
      external_id: "fixed-meeting",
      title: "고정 약속",
      start_at: "2026-09-07T01:00:00Z",
      end_at: "2026-09-07T02:00:00Z",
      is_busy: true,
    });
  });
  afterAll(async () => user?.cleanup());
  it("A29 prioritizes undated today plans and limits suggested work to actual remaining capacity", async () => {
    const svc = tasksService(ctx);
    const undated = await svc.createCard({
      title: "마감 없는 오늘 계획",
      planDate: "2026-09-07",
    });
    await svc.createCard({
      title: "긴급 마감",
      dueAt: "2026-09-07T03:00:00Z",
      priority: 0,
    });
    await svc.createCard({ title: "세 번째" });
    const plan = await getTodayPlan(ctx);
    expect(plan.availableMinutes).toBe(120);
    expect(plan.outcomes).toHaveLength(2);
    expect(plan.outcomes[0]?.id).toBe(undated.id);
    expect(plan.outcomes[0]).toMatchObject({
      dueAt: null,
      estimateConfirmed: false,
      estimatedMinutes: 60,
    });
    expect(plan.fixedEvents[0]?.title).toBe("고정 약속");
  });
  it("A30 explicit tomorrow/remove keep deadlines unchanged", async () => {
    const svc = tasksService(ctx);
    const card = await svc.createCard({
      title: "남은 계획",
      planDate: "2026-09-07",
      dueAt: "2026-09-09T03:00:00Z",
    });
    await svc.planCards(
      [{ id: card.id, expectedVersion: card.updated_at }],
      "2026-09-08",
    );
    const moved = await svc.getCard(card.id);
    expect(moved?.due_at).toBe(card.due_at);
    if (!moved) throw new Error("missing task");
    await svc.planCards(
      [{ id: card.id, expectedVersion: moved.updated_at }],
      null,
    );
    expect((await svc.getCard(card.id))?.due_at).toBe(card.due_at);
  });
  it("replaying a forced briefing in the same turn reuses its receipt without another model call", async () => {
    const execute = () =>
      insightsTools.generateBrief?.execute(
        { force: true } as never,
        ctx,
      ) as Promise<unknown>;
    const first = await runToolOnce(
      ctx,
      "today-brief-turn",
      "insights.generateBrief",
      { force: true },
      execute,
    );
    const replay = await runToolOnce(
      ctx,
      "today-brief-turn",
      "insights.generateBrief",
      { force: true },
      execute,
    );
    expect(replay).toEqual(first);
    expect(generate).toHaveBeenCalledOnce();
  });
  it("never reports known capacity from stale or unselected calendars", async () => {
    const repo = calendarRepository(user.db, user.id);
    await repo.updateCalendar(calendarId, {
      last_synced_at: "2026-09-06T00:00:00Z",
    });
    expect((await getTodayPlan(ctx)).availableMinutes).toBeNull();
    await repo.updateCalendar(calendarId, { selected: false });
    const plan = await getTodayPlan(ctx);
    expect(plan.availableMinutes).toBeNull();
    expect(plan.calendarStatus?.selectedCount).toBe(0);
  });
});
