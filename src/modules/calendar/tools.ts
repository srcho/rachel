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

function summarize(e: EventRow) {
  return {
    id: e.id,
    title: e.title,
    startAt: e.start_at,
    endAt: e.end_at,
    allDay: e.all_day,
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
      "기간(from~to, ISO 8601 타임존 포함)의 일정 목록. '오늘'·'내일'·'이번 주'는 [지금] 컨텍스트의 시각으로 from/to 를 계산해 넘긴다. 결과의 connected 가 true 면 캘린더는 연결된 상태이고, events 가 비어 있으면 그 기간에 일정이 없는 것이다.",
    inputSchema: listEventsSchema.omit({ q: true }),
    risk: "read",
    execute: async (input, ctx) => {
      const svc = eventService(ctx);
      const calendars = await svc.listCalendars(true);
      const events = calendars.length ? await svc.listEvents(input) : [];
      return {
        connected: calendars.length > 0,
        calendars: calendars.map((c) => c.name),
        events: events.map(summarize),
      };
    },
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
      "일정을 만든다(Google 캘린더에 바로 반영). 시각은 ISO 8601 타임존 포함. 종일이면 allDay=true, endAt 은 다음날 자정.",
    inputSchema: createEventSchema,
    risk: "write",
    execute: async (input, ctx) =>
      summarize(await eventService(ctx).createEvent(input)),
    undo: async (output, ctx) => {
      await eventService(ctx).deleteEvent(output.id);
    },
  }),
  updateEvent: defineTool({
    description: "일정의 제목·시간·장소·설명을 바꾼다. 바꿀 필드만.",
    inputSchema: z.object({ id: z.string().uuid(), patch: updateEventSchema }),
    risk: "write",
    execute: async ({ id, patch }, ctx) => {
      const { event, before } = await eventService(ctx).updateEvent(id, patch);
      return {
        ...summarize(event),
        _before: {
          title: before.title,
          startAt: before.start_at,
          endAt: before.end_at,
          allDay: before.all_day,
          location: before.location,
          description: before.description,
        },
      };
    },
    undo: async (output, ctx) => {
      const b = output._before;
      await eventService(ctx).updateEvent(output.id, {
        title: b.title,
        startAt: b.startAt,
        endAt: b.endAt,
        allDay: b.allDay,
        location: b.location ?? undefined,
        description: b.description ?? undefined,
      });
    },
  }),
  deleteEvent: defineTool({
    description:
      "일정을 삭제한다(Google 에서도 삭제). 되돌릴 수 없으니 먼저 확인받는다.",
    inputSchema: z.object({ id: z.string().uuid() }),
    risk: "destructive",
    execute: async ({ id }, ctx) => {
      const e = await eventService(ctx).deleteEvent(id);
      return { id, title: e.title };
    },
  }),
  findFreeSlots: defineTool({
    description:
      "기간 안에서 근무시간(기본 09~19시) 중 비어 있는 구간을 찾는다. '내일 오후 비는 시간' 같은 요청에 먼저 쓴다.",
    inputSchema: findFreeSlotsSchema,
    risk: "read",
    execute: async (input, ctx) => eventService(ctx).findFreeSlots(input),
  }),
};
