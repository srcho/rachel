import Link from "next/link";
import type { DashboardWidget } from "@/core/contracts";
import { dayBounds } from "@/core/utils/date";
import { eventService } from "./events";
import { eventTimeLabel } from "./format";
import type { EventRow } from "./repository";

export const todayTimelineWidget: DashboardWidget<{
  events: EventRow[];
  connected: boolean;
}> = {
  id: "calendar.today",
  title: "오늘 일정",
  surface: "today",
  size: "md",
  order: 10,
  load: async (ctx) => {
    const svc = eventService(ctx);
    const calendars = await svc.listCalendars(true);
    if (calendars.length === 0) return { events: [], connected: false };
    const { start, end } = dayBounds(ctx.now, ctx.timezone);
    return {
      events: await svc.listEvents({ from: start, to: end, limit: 30 }),
      connected: true,
    };
  },
  Component: ({ data }) => (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-medium">오늘 일정</h3>
        <Link
          href="/calendar"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          캘린더
        </Link>
      </div>
      {!data.connected ? (
        <p className="py-2 text-sm text-muted-foreground">
          <Link href="/settings" className="underline">
            Google 캘린더를 연결
          </Link>
          하면 여기에 보여요.
        </p>
      ) : data.events.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          오늘은 일정이 없어요.
        </p>
      ) : (
        <ul className="divide-y">
          {data.events.map((e) => (
            <li key={e.id} className="flex items-center gap-2 py-1 text-sm">
              <span className="w-[5.5rem] shrink-0 tabular-nums text-muted-foreground">
                {eventTimeLabel(e)}
              </span>
              <span className="min-w-0 flex-1 truncate">{e.title}</span>
              {e.location && (
                <span className="hidden max-w-[30%] truncate text-xs text-muted-foreground sm:block">
                  {e.location}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  ),
};
