import type { ServiceContext } from "@/core/contracts";
import { dayBounds, localYmd } from "@/core/utils/date";
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
    >,
  ): Partial<GEvent> {
    const tz = row.timezone ?? ctx.timezone;
    return {
      summary: row.title,
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

  async function createEvent(raw: CreateEventInput): Promise<EventRow> {
    const input = createEventSchema.parse(raw);
    const endAt =
      input.endAt ??
      new Date(
        new Date(input.startAt).getTime() + (input.allDay ? 24 : 1) * 3_600_000,
      ).toISOString();
    if (new Date(endAt) <= new Date(input.startAt))
      throw new Error("종료가 시작보다 빨라요");
    const cal = await writableCalendar(input.calendarId);
    let row = await repo.insertEvent({
      calendar_id: cal.id,
      external_id: `local:${crypto.randomUUID()}`,
      title: input.title,
      description: input.description ?? null,
      location: input.location ?? null,
      start_at: input.startAt,
      end_at: endAt,
      all_day: input.allDay,
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
    let row = await repo.updateEvent(id, {
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.description !== undefined && {
        description: patch.description,
      }),
      ...(patch.location !== undefined && { location: patch.location }),
      ...(patch.startAt !== undefined && { start_at: patch.startAt }),
      ...(patch.endAt != null && { end_at: patch.endAt }),
      ...(patch.allDay !== undefined && { all_day: patch.allDay }),
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
        return repo.updateEvent(row.id, { sync_status: "synced" });
      }
      if (isLocal) {
        const g = await google.insertEvent(
          token,
          cal.external_id,
          toGoogleBody(row),
        );
        return repo.updateEvent(row.id, { ...toRow(cal, g), deleted_at: null });
      }
      const g = await google.patchEvent(
        token,
        cal.external_id,
        row.external_id,
        toGoogleBody(row),
        row.etag ?? undefined,
      );
      return repo.updateEvent(row.id, { ...toRow(cal, g), deleted_at: null });
    } catch (e) {
      if (e instanceof GoogleApiError && e.status === 412) {
        return repo.updateEvent(row.id, { sync_status: "conflict" });
      }
      if (e instanceof GoogleApiError && e.status === 404 && row.deleted_at) {
        return repo.updateEvent(row.id, { sync_status: "synced" });
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

  /** 근무시간 안의 빈 구간(SQL 없이 메모리 계산: 범위가 며칠 단위라 충분). */
  async function findFreeSlots(
    raw: FindFreeSlotsInput,
  ): Promise<Array<{ startAt: string; endAt: string }>> {
    const f = findFreeSlotsSchema.parse(raw);
    const events = (
      await listEvents({ from: f.from, to: f.to, limit: 200 })
    ).filter((e) => !e.all_day);
    const busy = events
      .map((e) => [Date.parse(e.start_at), Date.parse(e.end_at)] as const)
      .sort((a, b) => a[0] - b[0]);
    const slots: Array<{ startAt: string; endAt: string }> = [];
    const need = f.durationMinutes * 60_000;
    for (
      let d = new Date(f.from);
      d < new Date(f.to) && slots.length < f.limit;
      d = new Date(d.getTime() + 86_400_000)
    ) {
      const { start } = dayBounds(d, ctx.timezone);
      const dayStart = Date.parse(start);
      let cursor = Math.max(
        dayStart + f.workStartHour * 3_600_000,
        Date.parse(f.from),
        ctx.now.getTime(),
      );
      const dayEnd = dayStart + f.workEndHour * 3_600_000;
      for (const [s, e] of busy) {
        if (e <= cursor) continue;
        if (s >= dayEnd) break;
        if (s - cursor >= need)
          slots.push({
            startAt: new Date(cursor).toISOString(),
            endAt: new Date(cursor + need).toISOString(),
          });
        cursor = Math.max(cursor, e);
        if (slots.length >= f.limit) break;
      }
      if (
        slots.length < f.limit &&
        dayEnd - cursor >= need &&
        cursor < Date.parse(f.to)
      )
        slots.push({
          startAt: new Date(cursor).toISOString(),
          endAt: new Date(cursor + need).toISOString(),
        });
    }
    return slots.slice(0, f.limit);
  }

  return {
    listEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    pushPending,
    findFreeSlots,
    getEvent: repo.getEvent,
    listCalendars: repo.listCalendars,
  };
}
