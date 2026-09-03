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
    const events = await eventService(ctx).listEvents({
      from: today.start,
      to: tomorrow.end,
      limit: 20,
    });
    if (events.length === 0) return null;
    const label = (iso: string) => (iso >= tomorrow.start ? "내일" : "오늘");
    return `[일정]\n${events
      .slice(0, 10)
      .map(
        (e) =>
          `- ${label(e.start_at)} ${eventTimeLabel(e, ctx.timezone)} ${e.title}${e.location ? ` @${e.location}` : ""} (id ${e.id.slice(0, 8)}…)`,
      )
      .join("\n")}`;
  },
};
