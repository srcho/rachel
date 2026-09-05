import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ServiceContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { calendarContextProvider } from "../context";
import { eventService } from "../events";
import { GoogleApiError, GTASKS_SCOPE, google, gtasks } from "../google";
import { gtasksService } from "../gtasks";
import { type CalendarRow, calendarRepository } from "../repository";
import { calendarService } from "../service";
import { calendarTools } from "../tools";

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("missing fixture");
  return value;
}

const token = vi.hoisted(() => ({ available: false }));
vi.mock("../tokens", () => ({
  getAccessToken: async () => {
    if (!token.available) throw new Error("offline token");
    return "test-only";
  },
  NeedsReauthError: class extends Error {},
}));
const available = await localSupabaseAvailable();
describe.skipIf(!available)("calendar capability contracts", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let other: Awaited<ReturnType<typeof testUser>>;
  let ctx: ServiceContext;
  let cal: CalendarRow;
  const range = { from: "2026-09-07T00:00:00Z", to: "2026-09-08T00:00:00Z" };
  beforeAll(async () => {
    user = await testUser("calendar-contracts");
    other = await testUser("calendar-other");
    ctx = {
      userId: user.id,
      db: user.db,
      actor: "user",
      now: new Date("2026-09-05T01:00:00Z"),
      timezone: "Asia/Seoul",
      registry: createRegistry(() => []),
      emit: async () => {},
      enqueue: async () => "",
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const repo = calendarRepository(user.db, user.id);
    const integration = await repo.upsertIntegration({
      account_email: user.email,
      status: "connected",
      scopes: [],
    });
    cal = required(
      (
        await repo.upsertCalendars([
          {
            integration_id: integration.id,
            external_id: "primary",
            name: "기본",
            selected: true,
            is_primary: true,
            writable: true,
            color: null,
          },
        ])
      )[0],
    );
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await user?.cleanup();
    await other?.cleanup();
  });

  it("A13/A14 paginates 205 matching events, filters before limit, and exposes incomplete mirror coverage", async () => {
    const repo = calendarRepository(user.db, user.id);
    const { error } = await user.db.from("calendar_events").insert(
      Array.from({ length: 205 }, (_, i) => ({
        user_id: user.id,
        calendar_id: cal.id,
        external_id: `page-${i}`,
        title: `검토 ${i}`,
        start_at: range.from,
        end_at: "2026-09-07T01:00:00Z",
        description: i === 204 ? "unique needle" : null,
      })),
    );
    if (error) throw error;
    const svc = eventService(ctx);
    const first = await svc.listEventsPage({ ...range, limit: 200 });
    expect(first.events).toHaveLength(200);
    expect(first.hasMore).toBe(true);
    expect(first.complete).toBe(false);
    expect(first.oauthStatus).toBe("connected");
    expect(first.coverage[0]?.freshness).toBe("never_synced");
    const second = await svc.listEventsPage({
      ...range,
      limit: 200,
      cursor: required(first.nextCursor),
    });
    expect(second.events).toHaveLength(5);
    expect(second.hasMore).toBe(false);
    expect(
      new Set([...first.events, ...second.events].map((e) => e.id)).size,
    ).toBe(205);
    expect(
      (await svc.listEventsPage({ ...range, q: "unique needle", limit: 1 }))
        .events,
    ).toHaveLength(1);
    await expect(
      svc.listEventsPage({
        ...range,
        q: "changed",
        cursor: required(first.nextCursor),
      }),
    ).rejects.toThrow("조회 조건");
    await repo.updateCalendar(cal.id, {
      last_synced_at: ctx.now.toISOString(),
      sync_coverage_from: "2026-09-01T00:00:00Z",
      sync_coverage_to: "2026-10-01T00:00:00Z",
    });
    expect((await svc.connectionStatus(range)).complete).toBe(true);
    expect(
      (
        await svc.connectionStatus({
          from: "2025-01-01T00:00:00Z",
          to: range.to,
        })
      ).complete,
    ).toBe(false);
    await repo.updateCalendar(cal.id, {
      last_synced_at: "2026-09-01T00:00:00Z",
    });
    expect((await svc.connectionStatus(range)).coverage[0]?.freshness).toBe(
      "stale",
    );
    await calendarService(ctx).setSelected(cal.id, false);
    expect(await svc.connectionStatus()).toMatchObject({
      connected: true,
      selectedCount: 0,
      selectionStatus: "none_selected",
      complete: false,
    });
    const context = await calendarContextProvider.build(ctx, "오늘 일정");
    expect(context).toContain("OAuth=connected");
    expect(context).toContain("선택 0개");
    expect(context).toContain("미완결");
    expect(context).not.toContain("오늘·내일 일정 없음");
    await calendarService(ctx).setSelected(cal.id, true);
  });

  it("A09 reports local delete with Google pending and retries the same tombstone", async () => {
    token.available = false;
    const svc = eventService(ctx);
    const row = await svc.createEvent({
      title: "삭제 대기",
      startAt: "2026-09-09T10:00:00+09:00",
    });
    await calendarRepository(user.db, user.id).updateEvent(row.id, {
      external_id: "google-delete",
    });
    const result = (await required(calendarTools.deleteEvent).execute(
      { id: row.id },
      ctx,
    )) as Record<string, unknown>;
    expect(result).toMatchObject({
      localDeleted: true,
      syncStatus: "pending_push",
      googleDeletion: "pending",
    });
    token.available = true;
    const remove = vi
      .spyOn(google, "deleteEvent")
      .mockRejectedValueOnce(new GoogleApiError(503, "offline"))
      .mockResolvedValue(undefined);
    expect((await svc.retryPush(row.id)).sync_status).toBe("pending_push");
    expect((await svc.retryPush(row.id)).sync_status).toBe("synced");
    expect(remove).toHaveBeenCalledTimes(2);
    expect((await svc.getEvent(row.id))?.deleted_at).not.toBeNull();
    token.available = false;
  });

  it("A15/A16 restores busy only and rejects stale undo without overwriting a newer title", async () => {
    const svc = eventService(ctx);
    const row = await svc.createEvent({
      title: "집중",
      startAt: "2026-09-10T10:00:00+09:00",
      isBusy: true,
    });
    const tool = required(calendarTools.updateEvent);
    const result = await tool.execute(
      { id: row.id, patch: { isBusy: false }, expectedVersion: row.updated_at },
      ctx,
    );
    expect(result).toMatchObject({ isBusy: false, _inverse: { isBusy: true } });
    await required(tool.undo)(result, ctx);
    expect((await svc.getEvent(row.id))?.is_busy).toBe(true);
    const result2 = await tool.execute(
      { id: row.id, patch: { isBusy: false } },
      ctx,
    );
    await svc.updateEvent(row.id, { title: "사용자 최신 제목" });
    await expect(required(tool.undo)(result2, ctx)).rejects.toThrow(
      "일정이 변경",
    );
    expect((await svc.getEvent(row.id))?.title).toBe("사용자 최신 제목");
    await expect(
      eventService({ ...ctx, db: other.db, userId: other.id }).deleteEvent(
        row.id,
      ),
    ).rejects.toThrow();
  });

  it("A11 serializes simultaneous reservations and returns the conflicting event", async () => {
    const svc = eventService(ctx);
    const input = {
      title: "동시 예약",
      startAt: "2026-09-11T10:00:00+09:00",
      endAt: "2026-09-11T11:00:00+09:00",
    };
    const results = await Promise.allSettled([
      svc.createEvent(input, { preventOverlap: true }),
      svc.createEvent(input, { preventOverlap: true }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(
      (r) => r.status === "rejected",
    ) as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "CALENDAR_OVERLAP" });
    expect(rejected.reason.conflicts).toHaveLength(1);
  });

  it("A18 refuses series/RSVP inputs and requires explicit occurrence scope", async () => {
    expect(
      required(calendarTools.createEvent).inputSchema.safeParse({
        title: "매주",
        startAt: range.from,
        recurrence: ["RRULE:FREQ=WEEKLY"],
      }).success,
    ).toBe(false);
    const svc = eventService(ctx);
    const row = await svc.createEvent({
      title: "반복 회의",
      startAt: "2026-09-12T10:00:00+09:00",
    });
    await calendarRepository(user.db, user.id).updateEvent(row.id, {
      recurring_event_id: "series",
    });
    await expect(
      required(calendarTools.updateEvent).execute(
        { id: row.id, patch: { title: "전체 이동" } },
        ctx,
      ),
    ).rejects.toThrow("시리즈 전체");
    const detail = await required(calendarTools.getEvent).execute(
      { id: row.id },
      ctx,
    );
    expect(detail).toMatchObject({
      isBusy: true,
      recurringEventId: "series",
      syncStatus: "pending_push",
      version: expect.any(String),
      seriesEditingSupported: false,
    });
  });

  it("reports one creator for concurrent retries and never undoes a reused event", async () => {
    const input = {
      creationKey: "concurrent-creation",
      title: "한 번 생성",
      startAt: "2026-09-18T10:00:00+09:00",
    };
    const svc = eventService(ctx);
    const results = await Promise.all([
      svc.createEvent(input),
      svc.createEvent(input),
    ]);
    expect(new Set(results.map((row) => row.id)).size).toBe(1);
    expect(results.filter((row) => row.createdNow)).toHaveLength(1);
    const reused = await required(calendarTools.createEvent).execute(
      input,
      ctx,
    );
    expect(reused).toMatchObject({ createdNow: false });
    await required(required(calendarTools.createEvent).undo)(reused, ctx);
    expect(
      (await svc.getEvent(required(results[0]).id))?.deleted_at,
    ).toBeNull();
  });

  it("A09 deletes the stable Google id even when the insertion response was never recorded", async () => {
    const svc = eventService(ctx);
    const row = await svc.createEvent({
      title: "삽입 결과 불명",
      startAt: "2026-09-19T10:00:00+09:00",
    });
    token.available = true;
    const remove = vi
      .mocked(google.deleteEvent)
      .mockClear()
      .mockRejectedValueOnce(new GoogleApiError(404, "absent"));
    const deleted = await svc.deleteEvent(row.id);
    expect(deleted.sync_status).toBe("synced");
    expect(remove.mock.calls[0]?.[2]).toBe(row.id.replaceAll("-", ""));
    token.available = false;
  });

  it("keeps conflicts out of blind retry and leaves pending writes recoverable if conflict fetch fails", async () => {
    const svc = eventService(ctx);
    const row = await svc.createEvent({
      title: "충돌",
      startAt: "2026-09-20T10:00:00+09:00",
    });
    const repo = calendarRepository(user.db, user.id);
    await repo.updateEvent(row.id, { external_id: "conflicting", etag: "v1" });
    token.available = true;
    vi.spyOn(google, "patchEvent").mockRejectedValue(
      new GoogleApiError(412, "changed"),
    );
    const get = vi
      .spyOn(google, "getEvent")
      .mockRejectedValueOnce(new Error("offline"));
    expect((await svc.retryPush(row.id)).sync_status).toBe("pending_push");
    get.mockResolvedValue({
      id: "conflicting",
      etag: "v2",
      summary: "외부 수정",
      start: { dateTime: row.start_at },
      end: { dateTime: row.end_at },
    });
    expect((await svc.retryPush(row.id)).sync_status).toBe("conflict");
    await expect(svc.retryPush(row.id)).rejects.toThrow("비교");
    const versions = await required(calendarTools.conflictVersions).execute(
      { id: row.id },
      ctx,
    );
    expect(versions).toMatchObject({
      remoteEtag: "v2",
      localVersion: expect.any(String),
    });
    token.available = false;
  });

  it("emits versioned before/after evidence only for effective direct user time changes", async () => {
    const emit = vi.fn(async () => {});
    const svc = eventService({ ...ctx, emit });
    const event = await svc.createEvent({
      title: "교정 근거",
      startAt: "2026-09-21T10:00:00+09:00",
      endAt: "2026-09-21T11:00:00+09:00",
    });
    emit.mockClear();
    await svc.updateEvent(event.id, { title: "제목만 변경" });
    expect(emit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          source: expect.objectContaining({
            eligibleForPreferenceLearning: false,
          }),
        }),
      }),
    );
    await svc.updateEvent(event.id, {
      startAt: "2026-09-21T13:00:00+09:00",
      endAt: "2026-09-21T14:00:00+09:00",
    });
    expect(emit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          before: {
            startAt: event.start_at,
            endAt: event.end_at,
            allDay: false,
          },
          after: {
            startAt: "2026-09-21T04:00:00+00:00",
            endAt: "2026-09-21T05:00:00+00:00",
            allDay: false,
          },
          beforeVersion: expect.any(String),
          afterVersion: expect.any(String),
          timezone: "Asia/Seoul",
          source: {
            actor: "user",
            kind: "direct_user_action",
            eligibleForPreferenceLearning: true,
          },
        }),
      }),
    );
    await eventService({ ...ctx, actor: "agent", emit }).updateEvent(event.id, {
      endAt: "2026-09-21T14:30:00+09:00",
    });
    expect(emit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          source: {
            actor: "agent",
            kind: "agent_action",
            eligibleForPreferenceLearning: false,
          },
        }),
      }),
    );
  });

  it("preserves Google Tasks date-only due dates in UTC+14", async () => {
    const { error } = await user.db
      .from("profiles")
      .update({ settings: { gtasks: { enabled: true, listId: "test-list" } } })
      .eq("id", user.id);
    if (error) throw error;
    await calendarRepository(user.db, user.id).upsertIntegration({
      account_email: user.email,
      scopes: [GTASKS_SCOPE],
      status: "connected",
    });
    token.available = true;
    vi.spyOn(gtasks, "list").mockResolvedValue({
      items: [
        { id: "date-task", title: "날짜 유지", due: "2026-09-22T00:00:00Z" },
      ],
    });
    const emit = vi.fn(async () => {});
    await gtasksService({
      ...ctx,
      timezone: "Pacific/Kiritimati",
      emit,
    }).pull();
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ dueAt: "2026-09-21T10:00:00.000Z" }),
      }),
    );
    token.available = false;
  });

  it("A35 uses confirmed duration and explicit time precedence, preserving a DST all-day boundary", async () => {
    const { error } = await user.db
      .from("profiles")
      .update({
        settings: {
          assistant: {
            scheduling: { defaultDurationMinutes: 30, preferredStartHour: 13 },
          },
        },
      })
      .eq("id", user.id);
    if (error) throw error;
    const svc = eventService(ctx);
    const row = await svc.createEvent({
      title: "기본 길이",
      startAt: "2026-09-14T10:00:00+09:00",
    });
    expect(Date.parse(row.end_at) - Date.parse(row.start_at)).toBe(30 * 60_000);
    const explicit = await svc.createEvent({
      title: "명시 길이",
      startAt: "2026-09-15T10:00:00+09:00",
      endAt: "2026-09-15T10:45:00+09:00",
    });
    expect(Date.parse(explicit.end_at) - Date.parse(explicit.start_at)).toBe(
      45 * 60_000,
    );
    const day = await eventService({
      ...ctx,
      timezone: "America/New_York",
    }).createEvent({
      title: "종일",
      startAt: "2026-11-01T10:00:00-05:00",
      allDay: true,
    });
    expect(day.start_at).toBe("2026-11-01T04:00:00+00:00");
    expect(day.end_at).toBe("2026-11-02T05:00:00+00:00");
    const slots = await svc.findFreeSlots({
      from: "2026-09-16T00:00:00+09:00",
      to: "2026-09-17T00:00:00+09:00",
    });
    expect(slots[0]?.startAt).toBe("2026-09-16T04:00:00.000Z");
    const overridden = await svc.findFreeSlots({
      from: "2026-09-16T00:00:00+09:00",
      to: "2026-09-17T00:00:00+09:00",
      preferredStartHour: 9,
    });
    expect(overridden[0]?.startAt).toBe("2026-09-16T00:00:00.000Z");
  });
});
