import type { ServiceContext } from "@/core/contracts";
import type { Json } from "@/core/db/types.generated";
import { dateTimeInZone } from "@/core/utils/date";
import { eventService } from "./events";
import { type GEvent, GoogleApiError, google } from "./google";
import {
  type CalendarRow,
  calendarRepository,
  type EventInsert,
} from "./repository";
import { CALENDAR_EVENTS } from "./service";
import { getAccessToken, NeedsReauthError } from "./tokens";

export const INITIAL_PAST_DAYS = 30;
export const INITIAL_FUTURE_DAYS = 180;

export function toRow(
  calendar: CalendarRow,
  e: GEvent,
  fallbackTimezone = "Asia/Seoul",
): Omit<EventInsert, "user_id"> {
  const allDay = Boolean(e.start?.date);
  const start =
    e.start?.dateTime ??
    (e.start?.date
      ? dateTimeInZone(
          `${e.start.date}T00:00`,
          e.start.timeZone ?? fallbackTimezone,
        )
      : new Date().toISOString());
  const end =
    e.end?.dateTime ??
    (e.end?.date
      ? dateTimeInZone(
          `${e.end.date}T00:00`,
          e.end.timeZone ?? fallbackTimezone,
        )
      : start);
  return {
    calendar_id: calendar.id,
    external_id: e.id,
    etag: e.etag ?? null,
    title: e.summary ?? "(제목 없음)",
    description: e.description || null,
    location: e.location || null,
    start_at: new Date(start).toISOString(),
    end_at: new Date(end).toISOString(),
    all_day: allDay,
    is_busy: e.transparency !== "transparent",
    google_has_reminders:
      e.reminders?.useDefault !== false ||
      Boolean(e.reminders.overrides?.length),
    timezone: e.start?.timeZone ?? fallbackTimezone,
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
    const range = {
      from: new Date(
        now.getTime() - INITIAL_PAST_DAYS * 86_400_000,
      ).toISOString(),
      to: new Date(
        now.getTime() + INITIAL_FUTURE_DAYS * 86_400_000,
      ).toISOString(),
    };
    const candidates = fullResync
      ? await repo.listReconcileCandidates(cal.id, range)
      : [];
    const seen = new Set<string>();
    do {
      const query: Record<string, string | undefined> = {
        pageToken,
        singleEvents: "true",
        showDeleted: "true",
        maxResults: "250",
        ...(fullResync
          ? { timeMin: range.from, timeMax: range.to }
          : { syncToken }),
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
      for (const item of page.items ?? []) seen.add(item.id);
      const rows = (page.items ?? []).map((e) => toRow(cal, e, ctx.timezone));
      upserted += await repo.upsertEvents(rows);
      pageToken = page.nextPageToken;
      if (page.nextSyncToken) syncToken = page.nextSyncToken;
    } while (pageToken);
    // Missing remote rows are authoritative only after the entire full snapshot succeeds.
    for (const row of candidates) {
      if (!seen.has(row.external_id))
        upserted += await repo.removeMissingMirror(row, now.toISOString());
    }
    await repo.updateCalendar(cal.id, {
      sync_token: syncToken ?? null,
      last_synced_at: now.toISOString(),
      ...(fullResync
        ? {
            sync_coverage_from: new Date(
              now.getTime() - INITIAL_PAST_DAYS * 86_400_000,
            ).toISOString(),
            sync_coverage_to: new Date(
              now.getTime() + INITIAL_FUTURE_DAYS * 86_400_000,
            ).toISOString(),
          }
        : {}),
    });
    return { upserted, fullResync };
  }
}
