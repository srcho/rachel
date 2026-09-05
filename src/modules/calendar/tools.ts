import { z } from "zod";
import { type AnyAgentTool, defineTool } from "@/core/contracts";
import { eventService } from "./events";
import { gtasksService } from "./gtasks";
import type { EventRow } from "./repository";
import {
  createEventSchema,
  findFreeSlotsSchema,
  listEventsSchema,
  updateEventSchema,
} from "./schema";
import { calendarService } from "./service";
import { syncCalendars } from "./sync";

function summarize(e: EventRow) {
  return {
    id: e.id,
    title: e.title,
    startAt: e.start_at,
    endAt: e.end_at,
    durationMinutes: (Date.parse(e.end_at) - Date.parse(e.start_at)) / 60_000,
    allDay: e.all_day,
    isBusy: e.is_busy,
    description: e.description,
    attendees: e.attendees,
    timezone: e.timezone,
    recurringEventId: e.recurring_event_id,
    status: e.status,
    version: e.updated_at,
    etag: e.etag,
    remoteUpdatedAt: e.remote_updated_at,
    deletedAt: e.deleted_at,
    source: "google_calendar",
    resourceType: "calendar_event",
    resourceLink: `/calendar?event=${e.id}`,
    supportedScope: "occurrence",
    seriesEditingSupported: false,
    invitationEditingSupported: false,
    location: e.location,
    calendarId: e.calendar_id,
    link: e.html_link,
    syncStatus: e.sync_status,
  };
}

export const calendarTools: Record<string, AnyAgentTool> = {
  googleTasksStatus: defineTool({
    description:
      "Google Tasks 미러 상태. 켜져 있으면 마감이 있는 카드가 Google 캘린더의 'Rachel' 할 일 목록에 보이고, Google 에서 완료·제목·마감을 바꾸면 카드에 반영된다.",
    inputSchema: z.object({}),
    risk: "read",
    execute: async (_i, ctx) => gtasksService(ctx).status(),
  }),
  googleTasksSetEnabled: defineTool({
    description:
      "Google Tasks 미러를 켜거나 끈다. 켜면 마감 있는 카드가 모두 Google 로 나간다(백필). 권한이 없으면 설정에서 Google 다시 연결이 필요하다고 안내한다.",
    inputSchema: z.object({ enabled: z.boolean() }),
    risk: "write",
    execute: async ({ enabled }, ctx) => gtasksService(ctx).setEnabled(enabled),
  }),
  googleTasksPull: defineTool({
    description:
      "Google Tasks 쪽 변경(완료·제목·마감·새 항목)을 지금 가져와 카드에 반영한다. 평소엔 15분마다 자동.",
    inputSchema: z.object({}),
    risk: "write",
    execute: async (_i, ctx) => gtasksService(ctx).pull(),
  }),
  listEvents: defineTool({
    description:
      "기간의 선택된 캘린더 일정을 검색한다(q는 제목·장소·설명). hasMore면 nextCursor로 계속 읽는다. OAuth 연결, 캘린더 선택, 수집 범위, 최신성을 별도로 확인하고 complete=false면 일정이 없다고 단정하지 않는다.",
    inputSchema: listEventsSchema,
    risk: "read",
    execute: async (input, ctx) => {
      const result = await eventService(ctx).listEventsPage(input);
      return { ...result, events: result.events.map(summarize) };
    },
  }),
  connectionStatus: defineTool({
    description:
      "Google OAuth 연결/재연결 필요, 캘린더 선택, 수집 기간과 동기화 최신성을 구분해서 읽는다.",
    inputSchema: z.object({}),
    risk: "read",
    execute: async (_input, ctx) => eventService(ctx).connectionStatus(),
  }),
  setSelected: defineTool({
    description:
      "기존 캘린더를 조회·동기화 대상에 넣거나 뺀다. OAuth 연결 해제와 다르다.",
    inputSchema: z.object({
      calendarId: z.string().uuid(),
      selected: z.boolean(),
    }),
    risk: "write",
    execute: async ({ calendarId, selected }, ctx) => {
      await calendarService(ctx).setSelected(calendarId, selected);
      return eventService(ctx).connectionStatus();
    },
  }),
  sync: defineTool({
    description:
      "대기 중 로컬 변경을 재전송하고 선택한 Google 캘린더를 지금 동기화한다. 결과 오류와 최신성을 확인한다.",
    inputSchema: z.object({}),
    risk: "write",
    execute: async (_input, ctx) => ({
      result: await syncCalendars(ctx),
      status: await eventService(ctx).connectionStatus(),
    }),
  }),
  conflictVersions: defineTool({
    description:
      "충돌한 일정의 로컬/Google 값을 비교한다. 해결 시 localVersion과 remoteEtag를 그대로 사용한다.",
    inputSchema: z.object({ id: z.string().uuid() }),
    risk: "read",
    execute: async ({ id }, ctx) => {
      const { local, remote } = await eventService(ctx).conflictVersions(id);
      return {
        local: summarize(local),
        remote,
        localVersion: local.updated_at,
        remoteEtag: remote.etag,
      };
    },
  }),
  resolveConflict: defineTool({
    description:
      "비교한 일정 충돌의 로컬 또는 Google 버전을 선택해 해결한다. 사용자가 선택한 쪽만, 두 버전이 여전히 일치할 때 적용한다.",
    inputSchema: z.object({
      id: z.string().uuid(),
      choice: z.enum(["local", "remote"]),
      localVersion: z.string(),
      remoteEtag: z.string(),
    }),
    risk: "write",
    execute: async ({ id, choice, localVersion, remoteEtag }, ctx) =>
      summarize(
        await eventService(ctx).resolveConflict(
          id,
          choice,
          localVersion,
          remoteEtag,
        ),
      ),
  }),
  retryPush: defineTool({
    description:
      "동일 일정의 대기 중 Google 쓰기/삭제를 재시도한다. 새 일정을 만들지 않으며 syncStatus로 외부 반영 여부를 보고한다.",
    inputSchema: z.object({ id: z.string().uuid() }),
    risk: "write",
    execute: async ({ id }, ctx) =>
      summarize(await eventService(ctx).retryPush(id)),
  }),
  getEvent: defineTool({
    description: "일정 하나의 상세(설명·참석자 포함).",
    inputSchema: z.object({ id: z.string().uuid() }),
    risk: "read",
    execute: async ({ id }, ctx) => {
      const e = await eventService(ctx).getEvent(id);
      if (!e) throw new Error("일정을 찾을 수 없어요");
      return {
        ...summarize(e),
        description: e.description,
        attendees: e.attendees,
      };
    },
  }),
  createEvent: defineTool({
    description:
      "일정을 로컬 저장하고 Google에 전송한다. syncStatus가 pending_push면 외부 반영은 대기 중이다. 반복 시리즈와 참석자 초대는 지원하지 않는다. 시각은 ISO 8601 타임존 포함(예 2026-09-16T10:30:00+09:00). calendarId 는 모르면 null(기본 캘린더) — 절대 지어내지 말 것. endAt 생략 시 확인된 기본 길이, 없으면 60분이다. 결과의 실제 길이를 알려 줄 것. 종일이면 allDay=true 로 하고 endAt 은 넣지 말 것(Google API 가 요구하는 다음날 배타적 종료는 서버가 채운다).",
    inputSchema: createEventSchema,
    risk: "write",
    execute: async (input, ctx) => {
      const event = await eventService(ctx).createEvent(input);
      return {
        ...summarize(event),
        createdNow: event.createdNow,
        durationDefaulted: !input.endAt && !input.allDay,
      };
    },
    undo: async (output, ctx) => {
      if (output.createdNow)
        await eventService(ctx).deleteEvent(output.id, output.version);
    },
  }),
  updateEvent: defineTool({
    description: "일정의 제목·시간·장소·설명을 바꾼다. 바꿀 필드만.",
    inputSchema: z.object({
      id: z.string().uuid(),
      patch: updateEventSchema,
      expectedVersion: z.string().optional(),
    }),
    risk: "write",
    execute: async ({ id, patch, expectedVersion }, ctx) => {
      const current = await eventService(ctx).getEvent(id);
      if (current?.recurring_event_id && patch.scope !== "occurrence")
        throw new Error(
          "반복 일정은 한 회차만 수정할 수 있어요. 해당 회차인지 확인해 주세요. 시리즈 전체 편집은 지원하지 않아요.",
        );
      const { event, before } = await eventService(ctx).updateEvent(
        id,
        patch,
        expectedVersion,
      );
      const mapping = {
        title: "title",
        startAt: "start_at",
        endAt: "end_at",
        allDay: "all_day",
        isBusy: "is_busy",
        location: "location",
        description: "description",
      } as const;
      const inverse: Record<string, unknown> = {};
      for (const [field, column] of Object.entries(mapping)) {
        // Include only effective field changes, including normalized dates for all-day changes.
        if (before[column] !== event[column]) inverse[field] = before[column];
      }
      return {
        ...summarize(event),
        _inverse: inverse,
        _expectedVersion: event.updated_at,
      };
    },
    undo: async (output, ctx) => {
      await eventService(ctx).updateEvent(
        output.id,
        updateEventSchema.parse(output._inverse),
        output._expectedVersion,
      );
    },
  }),
  deleteEvent: defineTool({
    description:
      "한 회차 일정을 로컬 삭제하고 Google 삭제를 요청한다. localDeleted와 syncStatus를 확인해 대기 중인 Google 삭제를 완료로 보고하지 않는다. 시리즈 전체 삭제는 지원하지 않는다.",
    inputSchema: z.object({
      id: z.string().uuid(),
      expectedVersion: z.string().optional(),
      scope: z.literal("occurrence").optional(),
    }),
    risk: "destructive",
    execute: async ({ id, expectedVersion, scope }, ctx) => {
      const current = await eventService(ctx).getEvent(id);
      if (current?.recurring_event_id && scope !== "occurrence")
        throw new Error(
          "반복 일정은 한 회차만 삭제할 수 있어요. 시리즈 전체 삭제는 지원하지 않아요.",
        );
      const e = await eventService(ctx).deleteEvent(id, expectedVersion);
      return {
        ...summarize(e),
        localDeleted: Boolean(e.deleted_at),
        googleDeletion:
          e.sync_status === "synced"
            ? "confirmed"
            : e.sync_status === "conflict"
              ? "conflict"
              : "pending",
        retryTool:
          e.sync_status === "pending_push" ? "calendar.retryPush" : null,
      };
    },
  }),
  findFreeSlots: defineTool({
    description:
      "기간 안에서 근무시간(기본 09~19시) 중 비어 있는 구간을 찾는다. '내일 오후 비는 시간' 같은 요청에 먼저 쓴다.",
    inputSchema: z.object({
      ...findFreeSlotsSchema.shape,
      durationMinutes: findFreeSlotsSchema.shape.durationMinutes
        .removeDefault()
        .optional(),
      workStartHour: findFreeSlotsSchema.shape.workStartHour
        .removeDefault()
        .optional(),
      workEndHour: findFreeSlotsSchema.shape.workEndHour
        .removeDefault()
        .optional(),
      bufferMinutes: findFreeSlotsSchema.shape.bufferMinutes
        .removeDefault()
        .optional(),
      includeWeekends: findFreeSlotsSchema.shape.includeWeekends
        .removeDefault()
        .optional(),
    }),
    risk: "read",
    execute: async (input, ctx) => {
      const svc = eventService(ctx);
      return {
        slots: await svc.findFreeSlots(input),
        status: await svc.connectionStatus(input),
        scope: "selected_calendar_mirror",
      };
    },
  }),
};
