import { z } from "zod";
import type { ServiceContext } from "@/core/contracts";
import { getSchedulingPreferences } from "@/core/settings/assistant";
import { dayBounds, localYmd } from "@/core/utils/date";
import { freeSlots } from "./free-slots";
import { type GEvent, GoogleApiError, google } from "./google";
import {
  type CalendarRow,
  calendarRepository,
  type EventRow,
} from "./repository";
import {
  type CreateEventInput,
  createEventSchema,
  type FindFreeSlotsInput,
  findFreeSlotsSchema,
  type ListEventsInput,
  listEventsSchema,
  type UpdateEventInput,
  updateEventSchema,
} from "./schema";
import { toRow } from "./sync";
import { getAccessToken, NeedsReauthError } from "./tokens";

export const EVENT_EVENTS = {
  created: "calendar_event.created",
  updated: "calendar_event.updated",
  deleted: "calendar_event.deleted",
} as const;

/** 일정 CRUD — Google 이 진실 원천, 로컬은 미러. 로컬 먼저 바꾸고 Google 에 밀어 넣는다(write-through). */
export function eventService(ctx: ServiceContext) {
  const repo = calendarRepository(ctx.db, ctx.userId);

  async function tokenOrNull(integrationId: string): Promise<string | null> {
    try {
      return await getAccessToken(ctx, integrationId);
    } catch (e) {
      if (e instanceof NeedsReauthError) return null;
      throw e;
    }
  }

  function toGoogleBody(
    row: Pick<
      EventRow,
      | "title"
      | "description"
      | "location"
      | "start_at"
      | "end_at"
      | "all_day"
      | "timezone"
      | "is_busy"
    >,
  ): Partial<GEvent> {
    const tz = row.timezone ?? ctx.timezone;
    return {
      summary: row.title,
      transparency: row.is_busy ? "opaque" : "transparent",
      description: row.description ?? "",
      location: row.location ?? "",
      start: row.all_day
        ? { date: localYmd(new Date(row.start_at), tz) }
        : { dateTime: row.start_at, timeZone: tz },
      end: row.all_day
        ? { date: localYmd(new Date(row.end_at), tz) }
        : { dateTime: row.end_at, timeZone: tz },
    };
  }

  /**
   * 쓸 캘린더. id 가 없거나 모르는 값(에이전트가 지어낸 UUID 등)이면 기본 캘린더로 간다.
   * 오류 문구는 "미연결"과 "쓸 캘린더 없음"을 구분한다 — 예전엔 둘 다 "연결해 주세요" 라서 레이첼이 미연결로 오답했다.
   */
  async function writableCalendar(
    calendarId?: string | null,
  ): Promise<CalendarRow> {
    const calendars = await repo.listCalendars();
    if (calendars.length === 0)
      throw new Error(
        "Google 캘린더가 연결되지 않았어요. 설정에서 연결해 주세요.",
      );
    const byId = calendarId
      ? calendars.find((c) => c.id === calendarId)
      : undefined;
    if (calendarId && !byId) throw new Error("지정한 캘린더를 찾을 수 없어요");
    if (byId && !byId.writable)
      throw new Error(`"${byId.name}" 은 읽기 전용이에요`);
    const cal =
      byId ??
      calendars.find((c) => c.is_primary && c.writable) ??
      calendars.find((c) => c.writable);
    if (!cal)
      throw new Error(
        "연결은 됐지만 쓰기 가능한 캘린더가 없어요(전부 읽기 전용). 설정 > Google 캘린더에서 확인해 주세요.",
      );
    return cal;
  }

  async function listEvents(raw: ListEventsInput): Promise<EventRow[]> {
    const f = listEventsSchema.parse(raw);
    const selected = (await repo.listCalendars(true)).map((c) => c.id);
    if (selected.length === 0) return [];
    const rows = await repo.listEvents(
      { from: f.from, to: f.to },
      { calendarIds: selected, limit: f.limit, q: f.q },
    );
    return rows;
  }

  async function connectionStatus(range?: { from: string; to: string }) {
    const [integration, calendars] = await Promise.all([
      repo.getIntegration(),
      repo.listCalendars(),
    ]);
    const selected = calendars.filter((c) => c.selected);
    const coverage = selected.map((c) => ({
      calendarId: c.id,
      lastSyncedAt: c.last_synced_at,
      from: c.sync_coverage_from,
      to: c.sync_coverage_to,
      freshness: !c.last_synced_at
        ? "never_synced"
        : ctx.now.getTime() - Date.parse(c.last_synced_at) > 30 * 60_000
          ? "stale"
          : "fresh",
      rangeCovered: Boolean(
        c.sync_coverage_from &&
          c.sync_coverage_to &&
          (!range ||
            (Date.parse(range.from) >= Date.parse(c.sync_coverage_from) &&
              Date.parse(range.to) <= Date.parse(c.sync_coverage_to))),
      ),
    }));
    return {
      connected: integration?.status === "connected",
      oauthStatus: integration?.status ?? "not_connected",
      lastSyncedAt: integration?.last_synced_at ?? null,
      lastError: integration?.last_error ?? null,
      selectedCount: selected.length,
      selectionStatus: selected.length ? "selected" : "none_selected",
      calendars: calendars.map((c) => ({
        id: c.id,
        name: c.name,
        writable: c.writable,
        primary: c.is_primary,
        selected: c.selected,
      })),
      coverage,
      timezone: ctx.timezone,
      complete:
        integration?.status === "connected" &&
        coverage.length > 0 &&
        coverage.every((c) => c.rangeCovered && c.freshness === "fresh"),
    };
  }

  async function listEventsPage(raw: ListEventsInput) {
    const f = listEventsSchema.parse(raw);
    if (Date.parse(f.to) <= Date.parse(f.from))
      throw new Error("올바른 조회 기간을 지정해 주세요");
    const status = await connectionStatus(f);
    const selected = status.calendars
      .filter((c) => c.selected)
      .map((c) => c.id)
      .sort();
    const scope = JSON.stringify([f.from, f.to, f.q ?? null, selected]);
    let after: { startAt: string; id: string } | undefined;
    if (f.cursor) {
      try {
        const cursor = JSON.parse(
          Buffer.from(f.cursor, "base64url").toString(),
        );
        if (cursor.scope !== scope) throw new Error();
        after = {
          startAt: new Date(cursor.startAt).toISOString(),
          id: z.string().uuid().parse(cursor.id),
        };
      } catch {
        throw new Error(
          "조회 조건이 바뀌었어요. 첫 페이지부터 다시 확인해 주세요",
        );
      }
    }
    const rows = selected.length
      ? await repo.listEvents(f, {
          calendarIds: selected,
          q: f.q,
          after,
          limit: f.limit + 1,
        })
      : [];
    const hasMore = rows.length > f.limit;
    const events = rows.slice(0, f.limit);
    const last = events.at(-1);
    return {
      ...status,
      events,
      range: { from: f.from, to: f.to, q: f.q ?? null },
      returned: events.length,
      hasMore,
      complete: status.complete && !hasMore,
      localPageComplete: !hasMore,
      nextCursor:
        hasMore && last
          ? Buffer.from(
              JSON.stringify({ scope, startAt: last.start_at, id: last.id }),
            ).toString("base64url")
          : null,
    };
  }

  /**
   * 시작/종료 정규화. 종료가 없으면 +1시간(종일은 다음날), 종일은 타임존 자정에 스냅(에이전트가 10:30 을 넘겨도 날짜만),
   * 종료 ≤ 시작이면 거부(생성·수정 공통 — 편집 창이 종료일을 포함일로 보여 주므로 여기서 잡아야 한다).
   */
  function normalizeRange(
    startIso: string,
    endIso: string | null,
    allDay: boolean,
    durationMinutes = 60,
    timezone = ctx.timezone,
  ): { startAt: string; endAt: string } {
    const startAt = allDay
      ? dayBounds(new Date(startIso), timezone).start
      : startIso;
    const endAt = allDay
      ? endIso
        ? dayBounds(new Date(Date.parse(endIso) - 1), timezone).end
        : dayBounds(new Date(startIso), timezone).end
      : (endIso ??
        new Date(
          Date.parse(startIso) + durationMinutes * 60_000,
        ).toISOString());
    if (new Date(endAt) <= new Date(startAt))
      throw new Error("종료가 시작보다 빨라요");
    return { startAt, endAt };
  }

  async function createEvent(
    raw: CreateEventInput,
    options: { preventOverlap?: boolean } = {},
  ): Promise<EventRow & { createdNow: boolean }> {
    const input = createEventSchema.parse(raw);
    if (input.creationKey) {
      const existing = await repo.findCreated(input.creationKey);
      if (existing) return { ...existing, createdNow: false };
    }
    const preferences = await getSchedulingPreferences(ctx.db, ctx.userId);
    const { startAt, endAt } = normalizeRange(
      input.startAt,
      input.endAt ?? null,
      input.allDay,
      preferences.defaultDurationMinutes ?? 60,
    );
    const cal = await writableCalendar(input.calendarId);
    const inserted = await repo.writeEvent(
      {
        creation_key: input.creationKey ?? null,
        calendar_id: cal.id,
        external_id: `local:${crypto.randomUUID()}`,
        title: input.title,
        description: input.description ?? null,
        location: input.location ?? null,
        start_at: startAt,
        end_at: endAt,
        all_day: input.allDay,
        is_busy: input.isBusy,
        timezone: ctx.timezone,
        sync_status: "pending_push",
      },
      undefined,
      undefined,
      options.preventOverlap,
    );
    const { createdNow } = inserted;
    const row = await pushOne(inserted, cal);
    if (createdNow)
      await ctx.emit({
        type: EVENT_EVENTS.created,
        entity: { type: "calendar_event", id: row.id },
        payload: { title: row.title, startAt: row.start_at },
      });
    return { ...row, createdNow };
  }

  async function updateEvent(
    id: string,
    raw: UpdateEventInput,
    expectedVersion?: string,
    options: { preventOverlap?: boolean } = {},
  ): Promise<{ event: EventRow; before: EventRow }> {
    const patch = updateEventSchema.parse(raw);
    const before = await repo.getEvent(id);
    if (!before || before.deleted_at) throw new Error("일정을 찾을 수 없어요");
    const cal = await repo.getCalendar(before.calendar_id);
    if (!cal?.writable) throw new Error("읽기 전용 캘린더의 일정이에요");
    const allDay = patch.allDay ?? before.all_day;
    const changesTime =
      patch.startAt !== undefined ||
      patch.endAt !== undefined ||
      patch.allDay !== undefined;
    const { startAt, endAt } = changesTime
      ? normalizeRange(
          patch.startAt ?? before.start_at,
          patch.endAt ?? before.end_at,
          allDay,
          60,
          before.timezone ?? ctx.timezone,
        )
      : { startAt: before.start_at, endAt: before.end_at };
    let row: EventRow = await repo.writeEvent(
      {
        ...(patch.title !== undefined && { title: patch.title }),
        ...(patch.description !== undefined && {
          description: patch.description ?? null,
        }),
        ...(patch.location !== undefined && {
          location: patch.location ?? null,
        }),
        start_at: startAt,
        end_at: endAt,
        all_day: allDay,
        ...(patch.isBusy !== undefined && { is_busy: patch.isBusy }),
        sync_status: "pending_push",
      },
      id,
      expectedVersion ?? before.updated_at,
      options.preventOverlap,
    );
    row = await pushOne(row, cal);
    await ctx.emit({
      type: EVENT_EVENTS.updated,
      entity: { type: "calendar_event", id },
      payload: {
        fields: Object.keys(patch),
        before: {
          startAt: before.start_at,
          endAt: before.end_at,
          allDay: before.all_day,
        },
        after: {
          startAt: row.start_at,
          endAt: row.end_at,
          allDay: row.all_day,
        },
        beforeVersion: before.updated_at,
        afterVersion: row.updated_at,
        timezone: ctx.timezone,
        source: {
          kind:
            ctx.actor === "user"
              ? "direct_user_action"
              : ctx.actor === "agent"
                ? "agent_action"
                : "system_action",
          actor: ctx.actor,
          eligibleForPreferenceLearning:
            ctx.actor === "user" &&
            (Date.parse(before.start_at) !== Date.parse(row.start_at) ||
              Date.parse(before.end_at) !== Date.parse(row.end_at) ||
              before.all_day !== row.all_day),
        },
      },
    });
    return { event: row, before };
  }

  async function deleteEvent(
    id: string,
    expectedVersion?: string,
  ): Promise<EventRow> {
    const before = await repo.getEvent(id);
    if (!before) throw new Error("일정을 찾을 수 없어요");
    const cal = await repo.getCalendar(before.calendar_id);
    if (!cal?.writable) throw new Error("읽기 전용 캘린더의 일정이에요");
    if (before.deleted_at) return before;
    let row: EventRow = await repo.writeEvent(
      {
        deleted_at: ctx.now.toISOString(),
        sync_status: "pending_push",
      },
      id,
      expectedVersion ??
        ctx.approvedVersions?.[`calendar_events:${id}`] ??
        before.updated_at,
    );
    row = await pushOne(row, cal);
    await ctx.emit({
      type: EVENT_EVENTS.deleted,
      entity: { type: "calendar_event", id },
      payload: { title: before.title },
    });
    return row;
  }

  /** pending 행 하나를 Google 에 반영. 실패하면 pending 으로 남긴다(잡이 재시도). */
  async function pushOne(row: EventRow, cal: CalendarRow): Promise<EventRow> {
    const isLocal = row.external_id.startsWith("local:");
    try {
      const token = await tokenOrNull(cal.integration_id);
      if (!token) return row;
      if (row.deleted_at) {
        await google.deleteEvent(
          token,
          cal.external_id,
          isLocal ? row.id.replaceAll("-", "") : row.external_id,
          row.etag ?? undefined,
        );
        return repo.finishPush(row.id, row.updated_at, {
          sync_status: "synced",
          remote_snapshot: null,
        });
      }
      if (isLocal) {
        // The same local UUID is used across retries, including lost Google responses.
        const googleId = row.id.replaceAll("-", "");
        let g: GEvent;
        try {
          g = await google.insertEvent(token, cal.external_id, {
            ...toGoogleBody(row),
            id: googleId,
          });
        } catch (e) {
          if (!(e instanceof GoogleApiError) || e.status !== 409) throw e;
          g = await google.getEvent(token, cal.external_id, googleId);
          const remote = toRow(cal, g, ctx.timezone);
          const changed =
            row.title !== remote.title ||
            (row.description ?? "") !== (remote.description ?? "") ||
            (row.location ?? "") !== (remote.location ?? "") ||
            Date.parse(row.start_at) !== Date.parse(remote.start_at) ||
            Date.parse(row.end_at) !== Date.parse(remote.end_at) ||
            row.all_day !== remote.all_day ||
            row.is_busy !== remote.is_busy;
          if (changed)
            return repo.finishPush(row.id, row.updated_at, {
              external_id: googleId,
              etag: remote.etag,
              sync_status: "conflict",
              remote_snapshot: remote,
            });
        }
        return repo.finishPush(row.id, row.updated_at, {
          ...toRow(cal, g, ctx.timezone),
          deleted_at: null,
          remote_snapshot: null,
        });
      }
      const g = await google.patchEvent(
        token,
        cal.external_id,
        row.external_id,
        toGoogleBody(row),
        row.etag ?? undefined,
      );
      return repo.finishPush(row.id, row.updated_at, {
        ...toRow(cal, g, ctx.timezone),
        deleted_at: null,
        remote_snapshot: null,
      });
    } catch (e) {
      if (e instanceof GoogleApiError && e.status === 412) {
        try {
          const token = await tokenOrNull(cal.integration_id);
          if (!token) return row;
          const remote = await google.getEvent(
            token,
            cal.external_id,
            row.external_id,
          );
          return repo.finishPush(row.id, row.updated_at, {
            sync_status: "conflict",
            remote_snapshot: toRow(cal, remote, ctx.timezone),
          });
        } catch (refreshError) {
          console.warn(
            "[calendar] conflict read failed, kept pending",
            refreshError,
          );
          return row;
        }
      }
      if (
        e instanceof GoogleApiError &&
        (e.status === 404 || e.status === 410) &&
        row.deleted_at
      ) {
        return repo.finishPush(row.id, row.updated_at, {
          sync_status: "synced",
          remote_snapshot: null,
        });
      }
      console.warn("[calendar] push failed, kept pending", e);
      return row;
    }
  }

  /** 동기화 잡이 pull 전에 호출: 밀리지 못한 변경을 다시 밀어 넣는다. */
  async function pushPending(): Promise<number> {
    const pending = await repo.listPending();
    let n = 0;
    for (const row of pending) {
      const cal = await repo.getCalendar(row.calendar_id);
      if (!cal) continue;
      const after = await pushOne(row, cal);
      if (after.sync_status === "synced") n++;
    }
    return n;
  }

  async function conflictVersions(id: string) {
    const local = await repo.getEvent(id);
    if (!local) throw new Error("일정을 찾을 수 없어요");
    const cal = await repo.getCalendar(local.calendar_id);
    if (!cal) throw new Error("캘린더를 찾을 수 없어요");
    const token = await getAccessToken(ctx, cal.integration_id);
    const remote = toRow(
      cal,
      await google.getEvent(token, cal.external_id, local.external_id),
    );
    return { local, remote };
  }

  async function resolveConflict(
    id: string,
    choice: "local" | "remote",
    localVersion: string,
    remoteEtag: string,
  ) {
    const { local, remote } = await conflictVersions(id);
    if (local.updated_at !== localVersion || remote.etag !== remoteEtag)
      throw new Error("비교 후 내용이 변경됐어요. 새 내용을 확인해 주세요.");
    if (choice === "remote")
      return repo.finishPush(
        id,
        localVersion,
        {
          ...remote,
          remote_snapshot: null,
        },
        true,
      );
    const cal = await repo.getCalendar(local.calendar_id);
    if (!cal?.writable) throw new Error("읽기 전용 캘린더예요");
    const pending = await repo.finishPush(
      id,
      localVersion,
      {
        etag: remote.etag,
        sync_status: "pending_push",
        remote_snapshot: null,
      },
      true,
    );
    return pushOne(pending, cal);
  }

  async function retryPush(id: string) {
    const row = await repo.getEvent(id);
    if (!row) throw new Error("일정을 찾을 수 없어요");
    if (row.sync_status === "synced") return row;
    if (row.sync_status === "conflict")
      throw new Error("두 내용을 비교한 후 선택해 주세요.");
    const cal = await repo.getCalendar(row.calendar_id);
    if (!cal?.writable) throw new Error("읽기 전용 캘린더예요");
    return pushOne(row, cal);
  }

  /** 근무시간 안의 빈 구간(SQL 없이 메모리 계산: 범위가 며칠 단위라 충분). */
  async function findFreeSlots(
    raw: FindFreeSlotsInput,
  ): Promise<Array<{ startAt: string; endAt: string }>> {
    const preferences = await getSchedulingPreferences(ctx.db, ctx.userId);
    const { defaultDurationMinutes, ...constraints } = preferences;
    const f = findFreeSlotsSchema.parse({
      ...constraints,
      durationMinutes: defaultDurationMinutes,
      ...Object.fromEntries(
        Object.entries(raw).filter(([, v]) => v !== undefined),
      ),
    });
    const selected = (await repo.listCalendars(true)).map((c) => c.id);
    if (selected.length === 0)
      throw new Error(
        "일정을 확인할 캘린더가 없어요. 캘린더 연결을 확인해 주세요.",
      );
    const events: EventRow[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await repo.listEvents(
        {
          from: new Date(
            Date.parse(f.from) - f.bufferMinutes * 60000,
          ).toISOString(),
          to: new Date(
            Date.parse(f.to) + f.bufferMinutes * 60000,
          ).toISOString(),
        },
        { calendarIds: selected, offset, limit: 500 },
      );
      events.push(...page);
      if (page.length < 500) break;
    }
    return freeSlots(events, f, ctx.now, ctx.timezone);
  }

  return {
    listEvents,
    listEventsPage,
    connectionStatus,
    createEvent,
    updateEvent,
    deleteEvent,
    pushPending,
    conflictVersions,
    resolveConflict,
    retryPush,
    findFreeSlots,
    getEvent: repo.getEvent,
    listCalendars: repo.listCalendars,
  };
}
