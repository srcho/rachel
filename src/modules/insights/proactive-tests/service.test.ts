import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DomainEvent, ServiceContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import {
  getProfileSettings,
  updateProfileSettings,
} from "@/core/settings/profile";
import { calendarRepository } from "@/modules/calendar/repository";
import { tasksService } from "@/modules/tasks/service";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { availableMinutes, proactiveService } from "../proactive";

const available = await localSupabaseAvailable();
it("unions busy intervals before measuring remaining capacity", () => {
  expect(
    availableMinutes(0, 120 * 60000, [
      { start: 0, end: 40 * 60000 },
      { start: 20 * 60000, end: 60 * 60000 },
    ]),
  ).toBe(60);
});
describe.skipIf(!available)("deterministic proactive suggestions", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let other: Awaited<ReturnType<typeof testUser>>;
  let ctx: ServiceContext;
  let calendarId: string;
  beforeAll(async () => {
    user = await testUser("proactive");
    other = await testUser("proactive-other");
    ctx = {
      db: user.db,
      userId: user.id,
      actor: "user",
      now: new Date("2026-09-05T00:00:00Z"),
      timezone: "Asia/Seoul",
      registry: createRegistry(() => []),
      emit: async () => {},
      enqueue: async () => "job",
    };
    const repo = calendarRepository(user.db, user.id);
    const integration = await repo.upsertIntegration({
      account_email: "proactive@test.local",
      scopes: [],
      status: "connected",
    });
    await repo.upsertCalendars([
      {
        integration_id: integration.id,
        external_id: "primary",
        name: "테스트 캘린더",
        color: null,
        is_primary: true,
        writable: true,
        selected: true,
      },
    ]);
    calendarId = (await repo.listCalendars())[0]?.id ?? "";
    await tasksService(ctx).ensureDefaultBoard();
  });
  afterAll(async () => {
    await user?.cleanup();
    await other?.cleanup();
  });
  beforeEach(async () => {
    for (const table of [
      "assistant_suggestions",
      "assistant_preference_corrections",
      "notification_controls",
      "cards",
      "calendar_events",
      "meeting_followups",
      "meetings",
      "memories",
    ] as const) {
      const { error } = await user.db
        .from(table)
        .delete()
        .eq("user_id", user.id);
      if (error) throw error;
    }
    const profile = await user.db
      .from("profiles")
      .update({ settings: {}, timezone: "Asia/Seoul" })
      .eq("id", user.id);
    if (profile.error) throw profile.error;
    const cal = await user.db
      .from("calendars")
      .update({
        last_synced_at: ctx.now.toISOString(),
        sync_coverage_from: "2026-09-01T00:00:00Z",
        sync_coverage_to: "2026-09-20T00:00:00Z",
      })
      .eq("id", calendarId);
    if (cal.error) throw cal.error;
  });
  async function event(title: string, start: string, end: string) {
    const { data, error } = await user.db
      .from("calendar_events")
      .insert({
        user_id: user.id,
        calendar_id: calendarId,
        external_id: crypto.randomUUID(),
        title,
        start_at: start,
        end_at: end,
        is_busy: true,
        sync_status: "synced",
      })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
  async function conflict() {
    const block = await event(
      "집중 시간",
      "2026-09-05T01:00:00Z",
      "2026-09-05T02:00:00Z",
    );
    const task = await tasksService(ctx).createCard({
      title: "제안서",
      calendarEventId: block.id,
      dueAt: "2026-09-05T14:59:00Z",
    });
    const fixed = await event(
      "고정 약속",
      "2026-09-05T01:30:00Z",
      "2026-09-05T02:30:00Z",
    );
    return { block, task, fixed };
  }
  it("A32 creates one durable conflict proposal without changing either event, suppresses dismissal until source time changes", async () => {
    const { task, fixed } = await conflict();
    const svc = proactiveService(ctx);
    await Promise.all([svc.refresh(), svc.refresh()]);
    let item = (await svc.list()).items.find((r) => r.kind === "time_conflict");
    if (!item) throw new Error("missing conflict");
    expect(item.href).toContain(task.id);
    expect(
      (await svc.list()).items.filter((r) => r.kind === "time_conflict"),
    ).toHaveLength(1);
    await svc.respond({
      id: item.id,
      expectedVersion: item.updated_at,
      action: "dismiss",
    });
    await svc.refresh();
    expect(
      (await svc.list()).items.filter((r) => r.kind === "time_conflict"),
    ).toHaveLength(0);
    const original = await user.db
      .from("calendar_events")
      .select("start_at")
      .eq("id", fixed.id)
      .single();
    expect(original.data?.start_at).toBe(fixed.start_at);
    const changed = await user.db
      .from("calendar_events")
      .update({ start_at: "2026-09-05T01:40:00Z" })
      .eq("id", fixed.id);
    if (changed.error) throw changed.error;
    await svc.refresh();
    item = (await svc.list()).items.find((r) => r.kind === "time_conflict");
    expect(item).toBeDefined();
  });
  it("A34 snoozes, disables kinds, respects initiative and hides stale calendar claims", async () => {
    await conflict();
    const svc = proactiveService(ctx);
    await svc.refresh();
    const row = (await svc.list()).items[0];
    if (!row) throw new Error("missing suggestion");
    await svc.respond({
      id: row.id,
      expectedVersion: row.updated_at,
      action: "snooze",
      until: "2026-09-05T01:00:00Z",
    });
    expect((await svc.list()).items).toHaveLength(0);
    expect(
      (
        await proactiveService({
          ...ctx,
          now: new Date("2026-09-05T01:01:00Z"),
        }).list()
      ).items,
    ).toHaveLength(1);
    await Promise.all([
      svc.setKindEnabled("time_conflict", false),
      svc.setKindEnabled("changed_evidence", false),
    ]);
    expect((await svc.controls())?.disabled_suggestion_kinds.sort()).toEqual([
      "changed_evidence",
      "time_conflict",
    ]);
    await svc.setKindEnabled("time_conflict", true);
    await updateProfileSettings(user.db, user.id, {
      assistant: { initiative: "on_request" },
    });
    expect(
      (
        await proactiveService({
          ...ctx,
          now: new Date("2026-09-05T01:01:00Z"),
        }).list()
      ).items,
    ).toHaveLength(0);
    expect(
      (
        await proactiveService({
          ...ctx,
          now: new Date("2026-09-05T01:01:00Z"),
        }).list(true)
      ).items,
    ).toHaveLength(1);
    await user.db
      .from("calendars")
      .update({ last_synced_at: "2026-09-04T00:00:00Z" })
      .eq("id", calendarId);
    const result = await svc.refresh();
    expect(result.notices.join(" ")).toContain("동기화");
    expect((await svc.list(true)).items).toHaveLength(0);
  });
  it("does not infer workload for tasks without durations; uses planned block durations only with complete calendar data", async () => {
    await tasksService(ctx).createCard({
      title: "길이 미정",
      dueAt: "2026-09-05T14:59:00Z",
    });
    const svc = proactiveService(ctx);
    expect(
      (await svc.collect()).candidates.some((r) => r.kind === "capacity_risk"),
    ).toBe(false);
    await user.db.from("cards").delete().eq("user_id", user.id);
    await conflict();
    await event("종일 예약", "2026-09-05T00:00:00Z", "2026-09-05T10:00:00Z");
    const collected = await svc.collect();
    expect(
      collected.candidates.find((r) => r.kind === "capacity_risk")?.evidence,
    ).toMatchObject({
      requiredMinutes: 60,
      availableMinutes: 0,
      basis: "user_scheduled_blocks",
    });
  });
  it("requires three distinct explicit corrections, keeps learned settings pending, and rejection suppresses repeats", async () => {
    const svc = proactiveService(ctx);
    const correction = (
      id: string,
      entityId: string,
      actor: "user" | "agent" = "user",
    ): DomainEvent => ({
      id,
      userId: user.id,
      actor,
      occurredAt: ctx.now.toISOString(),
      type: "calendar_event.updated",
      entity: { type: "calendar_event", id: entityId },
      payload: {
        before: {
          startAt: "2026-09-05T01:00:00Z",
          endAt: "2026-09-05T02:00:00Z",
          allDay: false,
        },
        after: {
          startAt: "2026-09-05T05:00:00Z",
          endAt: "2026-09-05T06:00:00Z",
          allDay: false,
        },
        source: { eligibleForPreferenceLearning: actor === "user" },
      },
    });
    await svc.recordCorrection(correction("ai", "a", "agent"));
    for (let i = 0; i < 2; i++)
      await svc.recordCorrection(correction(String(i), String(i)));
    expect((await svc.list(true)).items).toHaveLength(0);
    await svc.recordCorrection(correction("2", "2"));
    await svc.recordCorrection(correction("2", "2"));
    const row = (await svc.list(true)).items[0];
    if (!row) throw new Error("missing preference");
    expect(
      (await getProfileSettings(user.db, user.id)).assistant?.scheduling
        ?.preferredStartHour,
    ).toBeUndefined();
    expect((await svc.list()).items).toHaveLength(0);
    await updateProfileSettings(user.db, user.id, {
      assistant: { initiative: "active" },
    });
    expect((await svc.list()).items).toHaveLength(1);
    await svc.respond({
      id: row.id,
      expectedVersion: row.updated_at,
      action: "reject_preference",
    });
    await svc.recordCorrection(correction("3", "3"));
    expect((await svc.list(true)).items).toHaveLength(0);
  });
  it("applies only accepted stored preference and protects another user's suggestion", async () => {
    const { data: row, error } = await user.db
      .from("assistant_suggestions")
      .insert({
        user_id: user.id,
        dedupe_key: "accept-pref",
        kind: "preference",
        title: "기본 길이",
        body: "30분",
        href: "/settings",
        proposal: {
          key: "defaultDurationMinutes",
          value: 30,
          previousValue: null,
        },
      })
      .select("*")
      .single();
    if (error) throw error;
    const svc = proactiveService(ctx);
    await expect(
      proactiveService({ ...ctx, db: other.db, userId: other.id }).respond({
        id: row.id,
        expectedVersion: row.updated_at,
        action: "accept_preference",
      }),
    ).rejects.toThrow("찾을 수");
    await expect(
      proactiveService({
        ...ctx,
        actor: "agent",
        latestUserMessage: { id: "msg", text: "오늘 할 일을 보여줘" },
      }).respond({
        id: row.id,
        expectedVersion: row.updated_at,
        action: "accept_preference",
        userQuote: "오늘 할 일을 보여줘",
      }),
    ).rejects.toThrow("수락한 내용");
    expect(
      await svc.respond({
        id: row.id,
        expectedVersion: row.updated_at,
        action: "accept_preference",
      }),
    ).toMatchObject({ changed: true, status: "accepted" });
    const settings = await getProfileSettings(user.db, user.id);
    expect(settings.assistant?.scheduling?.defaultDurationMinutes).toBe(30);
    expect(settings.assistant?.evidence).toMatchObject({
      basis: "accepted_candidate",
      suggestionId: row.id,
    });
  });
  it("collects only unconfirmed owned meeting actions, date-only waiting followups and invalidated evidence", async () => {
    const summary = {
      tldr: "테스트",
      keyPoints: [],
      decisions: [],
      actionItems: [
        { title: "내 후속", owner: "나", sourceSeq: [] },
        { title: "타인 후속", owner: "민수", sourceSeq: [] },
      ],
      openQuestions: [],
      participants: [],
      followups: [],
    };
    const meeting = await user.db
      .from("meetings")
      .insert({
        user_id: user.id,
        title: "확인할 회의",
        started_at: "2026-09-04T01:00:00Z",
        summary,
      })
      .select("*")
      .single();
    if (meeting.error) throw meeting.error;
    const waiting = await tasksService(ctx).createCard({
      title: "확인: 받을 자료",
      dueAt: "2026-09-05T14:59:00Z",
      dueHasTime: false,
    });
    const followup = await user.db.from("meeting_followups").insert({
      user_id: user.id,
      meeting_id: meeting.data.id,
      action_key: "waiting-test",
      kind: "waiting",
      result_id: waiting.id,
      choice: { title: "자료", key: "waiting-test" },
    });
    if (followup.error) throw followup.error;
    const memory = await user.db.from("memories").insert({
      user_id: user.id,
      content: "바뀐 회의 결정",
      kind: "decision",
      status: "active",
      source: {
        type: "meeting",
        id: meeting.data.id,
        version: meeting.data.content_version,
      },
    });
    if (memory.error) throw memory.error;
    const edited = await user.db
      .from("meetings")
      .update({ title: "교정된 회의" })
      .eq("id", meeting.data.id);
    if (edited.error) throw edited.error;
    const candidates = (await proactiveService(ctx).collect()).candidates;
    expect(
      candidates.find((c) => c.kind === "meeting_followup")?.body,
    ).toContain("미확정 1개");
    expect(
      candidates.find((c) => c.kind === "waiting_followup")?.evidence.cardId,
    ).toBe(waiting.id);
    expect(
      candidates.find((c) => c.kind === "changed_evidence")?.body,
    ).toContain("바뀐 회의 결정");
    const changed = candidates.find((c) => c.kind === "changed_evidence");
    expect(changed?.href).toBe(
      `/memory?id=${changed?.evidence.memoryId}#memory-${changed?.evidence.memoryId}`,
    );
  });
});
