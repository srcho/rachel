import type { ContextProvider } from "@/core/contracts";
import { dayBounds, localYmd } from "@/core/utils/date";
import { eventService } from "./events";
import { addDays } from "./format";
import { expandOccurrences, occurrenceLabel } from "./occurrences";

/** 오늘·내일 일정 ≤ 10 */
export const calendarContextProvider: ContextProvider = {
  id: "calendar.upcoming",
  budgetTokens: 800,
  build: async (ctx) => {
    const today = dayBounds(ctx.now, ctx.timezone);
    const tomorrow = dayBounds(ctx.now, ctx.timezone, 1);
    const svc = eventService(ctx);
    const calendars = await svc.listCalendars(true);
    if (calendars.length === 0)
      return "[일정] Google 캘린더 미연결(설정에서 연결 가능)";
    const events = await svc.listEvents({
      from: today.start,
      to: tomorrow.end,
      limit: 20,
    });
    const names = calendars
      .filter((c) => c.writable)
      .map((c) => `${c.name}${c.is_primary ? "(기본)" : ""}`)
      .join(", ");
    if (events.length === 0)
      return `[일정] Google 캘린더 연결됨(쓰기 가능: ${names}). 오늘·내일 일정 없음`;
    const todayYmd = localYmd(ctx.now, ctx.timezone);
    const byDay = expandOccurrences(
      events,
      todayYmd,
      addDays(todayYmd, 2),
      ctx.timezone,
    );
    const lines = [
      ...(byDay.get(todayYmd) ?? []).map((o) => ({ day: "오늘", o })),
      ...(byDay.get(addDays(todayYmd, 1)) ?? []).map((o) => ({
        day: "내일",
        o,
      })),
    ].slice(0, 10);
    return `[일정] 연결됨(쓰기 가능: ${names})\n${lines
      .map(
        ({ day, o }) =>
          `- ${day} ${occurrenceLabel(o, ctx.timezone)} ${o.event.title}${o.event.location ? ` @${o.event.location}` : ""} (id ${o.event.id.slice(0, 8)}…)`,
      )
      .join("\n")}`;
  },
};
