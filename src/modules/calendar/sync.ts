import type { ServiceContext } from "@/core/contracts";
import type { Json } from "@/core/db/types.generated";
import { tzOffsetMs } from "@/core/utils/date";
import { eventService } from "./events";
import { type GEvent, GoogleApiError, google } from "./google";
import {
  type CalendarRow,
  calendarRepository,
  type EventInsert,
} from "./repository";
import { CALENDAR_EVENTS } from "./service";
import { getAccessToken, NeedsReauthError } from "./tokens";

const INITIAL_PAST_DAYS = 30;
const INITIAL_FUTURE_DAYS = 180;

export function toRow(
  calendar: CalendarRow,
  e: GEvent,
): Omit<EventInsert, "user_id"> {
  const allDay = Boolean(e.start?.date);
  const start =
    e.start?.dateTime ??
    (e.start?.date
      ? `${e.start.date}T00:00:00${offsetFor(e.start.timeZone, e.start.date)}`
      : new Date().toISOString());
  const end =
    e.end?.dateTime ??
    (e.end?.date
      ? `${e.end.date}T00:00:00${offsetFor(e.end.timeZone, e.end.date)}`
      : start);
  return {
    calendar_id: calendar.id,
    external_id: e.id,
    etag: e.etag ?? null,
    title: e.summary ?? "(제목 없음)",
    description: e.description ?? null,
    location: e.location ?? null,
    start_at: new Date(start).toISOString(),
    end_at: new Date(end).toISOString(),
    all_day: allDay,
    is_busy: e.transparency !== "transparent",
    google_has_reminders:
      e.reminders?.useDefault !== false ||
      Boolean(e.reminders.overrides?.length),
    timezone: e.start?.timeZone ?? null,
    recurring_event_id: e.recurringEventId ?? null,
    attendees: (e.attendees ?? []).map((a) => ({
      email: a.email,
      name: a.displayName,
      status: a.responseStatus,
      self: a.self,
    })) as unknown as Json,
    status: e.status ?? "confirmed",
    html_link: e.htmlLink ?? null,
    sync_status: "synced",
    remote_updated_at: e.updated ?? null,
    deleted_at: e.status === "cancelled" ? new Date().toISOString() : null,
  };
}

/** 종일 일정은 캘린더 타임존 자정. 그 날짜의 오프셋(DST 존 대비) — 타임존 정보가 없으면 서울. */
function offsetFor(tz: string | undefined, ymd: string): string {
  const zone = tz ?? "Asia/Seoul";
  const ms = tzOffsetMs(zone, new Date(`${ymd}T12:00:00Z`));
  const sign = ms >= 0 ? "+" : "-";
  const abs = Math.abs(ms) / 60_000;
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

export interface SyncResult {
  calendars: number;
  upserted: number;
  fullResync: number;
  errors: string[];
}

/**
 * 선택된 캘린더를 증분 동기화한다(syncToken). 410 이면 초기 동기화로 되돌린다.
 * 사용자 세션 또는 service-role 컨텍스트 모두에서 동작(리포지토리가 userId 스코프).
 */
export async function syncCalendars(ctx: ServiceContext): Promise<SyncResult> {
  const repo = calendarRepository(ctx.db, ctx.userId);
  const integration = await repo.getIntegration();
  const result: SyncResult = {
    calendars: 0,
    upserted: 0,
    fullResync: 0,
    errors: [],
  };
  if (!integration || integration.status !== "connected") return result;

  let token: string;
  try {
    token = await getAccessToken(ctx, integration.id);
  } catch (e) {
    if (e instanceof NeedsReauthError)
      return { ...result, errors: [e.message] };
    throw e;
  }

  // 먼저 밀리지 못한 로컬 변경을 Google 에 반영
  try {
    await eventService(ctx).pushPending();
  } catch (e) {
    result.errors.push(`push: ${e instanceof Error ? e.message : String(e)}`);
  }

  const calendars = await repo.listCalendars(true);
  for (const cal of calendars) {
    result.calendars++;
    try {
      const r = await syncOne(cal, token);
      result.upserted += r.upserted;
      if (r.fullResync) result.fullResync++;
    } catch (e) {
      result.errors.push(
        `${cal.name}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  await repo.updateIntegration(integration.id, {
    ...(result.errors.length === 0 && {
      last_synced_at: ctx.now.toISOString(),
    }),
    last_error: result.errors[0] ?? null,
  });
  if (result.upserted > 0)
    await ctx.emit({
      type: CALENDAR_EVENTS.synced,
      entity: { type: "integration", id: integration.id },
      payload: { upserted: result.upserted },
    });
  return result;

  async function syncOne(
    cal: CalendarRow,
    accessToken: string,
    retryOn410 = true,
  ): Promise<{ upserted: number; fullResync: boolean }> {
    let pageToken: string | undefined;
    let syncToken = cal.sync_token ?? undefined;
    let upserted = 0;
    const fullResync = !syncToken;
    const now = ctx.now;
    do {
      const query: Record<string, string | undefined> = syncToken
        ? { syncToken, pageToken }
        : {
            pageToken,
            singleEvents: "true",
            showDeleted: "true",
            timeMin: new Date(
              now.getTime() - INITIAL_PAST_DAYS * 86_400_000,
            ).toISOString(),
            timeMax: new Date(
              now.getTime() + INITIAL_FUTURE_DAYS * 86_400_000,
            ).toISOString(),
            maxResults: "250",
          };
      let page: Awaited<ReturnType<typeof google.listEvents>>;
      try {
        page = await google.listEvents(accessToken, cal.external_id, query);
      } catch (e) {
        if (e instanceof GoogleApiError && e.status === 410 && retryOn410) {
          await repo.updateCalendar(cal.id, { sync_token: null });
          return syncOne({ ...cal, sync_token: null }, accessToken, false);
        }
        throw e;
      }
      const rows = (page.items ?? []).map((e) => toRow(cal, e));
      upserted += await repo.upsertEvents(rows);
      pageToken = page.nextPageToken;
      if (page.nextSyncToken) syncToken = page.nextSyncToken;
    } while (pageToken);
    await repo.updateCalendar(cal.id, {
      sync_token: syncToken ?? null,
      last_synced_at: now.toISOString(),
    });
    return { upserted, fullResync };
  }
}
