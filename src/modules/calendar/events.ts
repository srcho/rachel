import type { ServiceContext } from "@/core/contracts";
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
      description: row.description ?? undefined,
      location: row.location ?? undefined,
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
    let rows = await repo.listEvents(
      { from: f.from, to: f.to },
      { calendarIds: selected, limit: f.limit },
    );
    if (f.q) {
      const q = f.q.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          (r.location ?? "").toLowerCase().includes(q),
      );
    }
    return rows;
  }

  /**
   * 시작/종료 정규화. 종료가 없으면 +1시간(종일은 다음날), 종일은 타임존 자정에 스냅(에이전트가 10:30 을 넘겨도 날짜만),
   * 종료 ≤ 시작이면 거부(생성·수정 공통 — 편집 창이 종료일을 포함일로 보여 주므로 여기서 잡아야 한다).
   */
  function normalizeRange(
    startIso: string,
    endIso: string | null,
    allDay: boolean,
  ): { startAt: string; endAt: string } {
    let startAt = startIso;
    let endAt =
      endIso ??
      new Date(
        new Date(startIso).getTime() + (allDay ? 24 : 1) * 3_600_000,
      ).toISOString();
    if (allDay) {
      startAt = dayBounds(new Date(startAt), ctx.timezone).start;
      endAt = dayBounds(
        new Date(new Date(endAt).getTime() - 1),
        ctx.timezone,
      ).end;
    }
    if (new Date(endAt) <= new Date(startAt))
      throw new Error("종료가 시작보다 빨라요");
    return { startAt, endAt };
  }

  async function createEvent(raw: CreateEventInput): Promise<EventRow> {
    const input = createEventSchema.parse(raw);
    if (input.creationKey) {
      const existing = await repo.findCreated(input.creationKey);
      if (existing) return existing;
    }
    const { startAt, endAt } = normalizeRange(
      input.startAt,
      input.endAt ?? null,
      input.allDay,
    );
    const cal = await writableCalendar(input.calendarId);
    let row = await repo.insertEvent({
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
    });
    row = await pushOne(row, cal);
    await ctx.emit({
      type: EVENT_EVENTS.created,
      entity: { type: "calendar_event", id: row.id },
      payload: { title: row.title, startAt: row.start_at },
    });
    return row;
  }

  async function updateEvent(
    id: string,
    raw: UpdateEventInput,
  ): Promise<{ event: EventRow; before: EventRow }> {
    const patch = updateEventSchema.parse(raw);
    const before = await repo.getEvent(id);
    if (!before) throw new Error("일정을 찾을 수 없어요");
    const cal = await repo.getCalendar(before.calendar_id);
    if (!cal?.writable) throw new Error("읽기 전용 캘린더의 일정이에요");
    const allDay = patch.allDay ?? before.all_day;
    const { startAt, endAt } = normalizeRange(
      patch.startAt ?? before.start_at,
      patch.endAt ?? before.end_at,
      allDay,
    );
    let row = await repo.updateEvent(id, {
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
    });
    row = await pushOne(row, cal);
    await ctx.emit({
      type: EVENT_EVENTS.updated,
      entity: { type: "calendar_event", id },
      payload: { fields: Object.keys(patch) },
    });
    return { event: row, before };
  }

  async function deleteEvent(id: string): Promise<EventRow> {
    const before = await repo.getEvent(id);
    if (!before) throw new Error("일정을 찾을 수 없어요");
    const cal = await repo.getCalendar(before.calendar_id);
    if (!cal?.writable) throw new Error("읽기 전용 캘린더의 일정이에요");
    const row = await repo.updateEvent(id, {
      deleted_at: ctx.now.toISOString(),
      sync_status: "pending_push",
    });
    await pushOne(row, cal);
    await ctx.emit({
      type: EVENT_EVENTS.deleted,
      entity: { type: "calendar_event", id },
      payload: { title: before.title },
    });
    return before;
  }

  /** pending 행 하나를 Google 에 반영. 실패하면 pending 으로 남긴다(잡이 재시도). */
  async function pushOne(row: EventRow, cal: CalendarRow): Promise<EventRow> {
    const token = await tokenOrNull(cal.integration_id);
    if (!token) return row;
    const isLocal = row.external_id.startsWith("local:");
    try {
      if (row.deleted_at) {
        if (!isLocal)
          await google.deleteEvent(token, cal.external_id, row.external_id);
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
          const remote = toRow(cal, g);
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
          ...toRow(cal, g),
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
        ...toRow(cal, g),
        deleted_at: null,
        remote_snapshot: null,
      });
    } catch (e) {
      if (e instanceof GoogleApiError && e.status === 412) {
        const remote = await google.getEvent(
          token,
          cal.external_id,
          row.external_id,
        );
        return repo.finishPush(row.id, row.updated_at, {
          sync_status: "conflict",
          remote_snapshot: toRow(cal, remote),
        });
      }
      if (e instanceof GoogleApiError && e.status === 404 && row.deleted_at) {
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
      return repo.finishPush(id, localVersion, {
        ...remote,
        remote_snapshot: null,
      });
    const cal = await repo.getCalendar(local.calendar_id);
    if (!cal?.writable) throw new Error("읽기 전용 캘린더예요");
    const pending = await repo.finishPush(id, localVersion, {
      etag: remote.etag,
      sync_status: "pending_push",
      remote_snapshot: null,
    });
    return pushOne(pending, cal);
  }

  async function retryPush(id: string) {
    const row = await repo.getEvent(id);
    if (!row) throw new Error("일정을 찾을 수 없어요");
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
    const f = findFreeSlotsSchema.parse(raw);
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
