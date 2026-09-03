import type { ContextProvider } from "@/core/contracts";
import { dayBounds } from "@/core/utils/date";
import { eventService } from "./events";
import { eventTimeLabel } from "./format";

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
    const label = (iso: string) => (iso >= tomorrow.start ? "내일" : "오늘");
    return `[일정] 연결됨(쓰기 가능: ${names})\n${events
      .slice(0, 10)
      .map(
        (e) =>
          `- ${label(e.start_at)} ${eventTimeLabel(e, ctx.timezone)} ${e.title}${e.location ? ` @${e.location}` : ""} (id ${e.id.slice(0, 8)}…)`,
      )
      .join("\n")}`;
  },
};
