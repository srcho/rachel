import Link from "next/link";
import type { DashboardWidget } from "@/core/contracts";
import { dayBounds } from "@/core/utils/date";
import { eventService } from "./events";
import { eventTimeLabel } from "./format";
import type { EventRow } from "./repository";

/** 오늘 일정. 목적: 지금 이후 무엇이 남았는지, 시간순으로. */
export const todayTimelineWidget: DashboardWidget<{
  events: EventRow[];
  connected: boolean;
}> = {
  id: "calendar.today",
  title: "오늘 일정",
  surface: "today",
  size: "md",
  rows: 2,
  href: "/calendar",
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
  Component: ({ data }) =>
    !data.connected ? (
      <p className="flex h-full min-h-16 items-center text-sm text-muted-foreground">
        <Link href="/settings" className="underline underline-offset-2">
          Google 캘린더를 연결
        </Link>
        하면 여기에 보여요.
      </p>
    ) : data.events.length === 0 ? (
      <p className="flex h-full min-h-16 items-center text-sm text-muted-foreground">
        오늘은 일정이 없어요.
      </p>
    ) : (
      <ul className="divide-y">
        {data.events.map((e) => {
          const past = new Date(e.end_at).getTime() < Date.now();
          return (
            <li
              key={e.id}
              className={`flex items-center gap-2 py-1.5 text-sm ${past ? "text-muted-foreground" : ""}`}
            >
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
          );
        })}
      </ul>
    ),
};
