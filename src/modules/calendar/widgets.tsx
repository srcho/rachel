import Link from "next/link";
import type { DashboardWidget } from "@/core/contracts";
import { dayBounds, localYmd } from "@/core/utils/date";
import { eventService } from "./events";
import { addDays } from "./format";
import { expandOccurrences, occurrenceLabel } from "./occurrences";
import type { EventRow } from "./repository";

/** 오늘 일정. 목적: 지금 이후 무엇이 남았는지, 시간순으로. */
export const todayTimelineWidget: DashboardWidget<{
  events: EventRow[];
  connected: boolean;
  /** load 시점의 "오늘"(타임존 기준) — 렌더 시점 시계와 어긋나지 않게 데이터로 내린다 */
  today: string;
  timezone: string;
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
    const today = localYmd(ctx.now, ctx.timezone);
    if (calendars.length === 0)
      return { events: [], connected: false, today, timezone: ctx.timezone };
    const { start, end } = dayBounds(ctx.now, ctx.timezone);
    return {
      events: await svc.listEvents({ from: start, to: end, limit: 30 }),
      connected: true,
      today,
      timezone: ctx.timezone,
    };
  },
  Component: ({ data }) =>
    !data.connected ? (
      <p className="flex h-full min-h-10 items-center text-sm text-muted-foreground">
        <Link href="/settings" className="underline underline-offset-2">
          Google 캘린더를 연결
        </Link>
        하면 여기에 보여요.
      </p>
    ) : data.events.length === 0 ? (
      <p className="flex h-full min-h-10 items-center text-sm text-muted-foreground">
        오늘은 일정이 없어요.
      </p>
    ) : (
      <ul className="divide-y">
        {(
          expandOccurrences(
            data.events,
            data.today,
            addDays(data.today, 1),
            data.timezone,
          ).get(data.today) ?? []
        ).map((o) => {
          const e = o.event;
          const past = new Date(e.end_at).getTime() < Date.now();
          return (
            <li
              key={e.id}
              className={`flex items-center gap-2 py-1.5 text-sm ${past ? "text-muted-foreground" : ""}`}
            >
              <span className="w-[5.5rem] shrink-0 tabular-nums text-muted-foreground">
                {occurrenceLabel(o, data.timezone)}
              </span>
              <Link
                href={`/calendar?event=${e.id}&date=${data.today}`}
                className="min-w-0 flex-1 truncate py-2"
              >
                {e.title}
              </Link>
              <Link
                href={`/calendar?event=${e.id}&date=${data.today}`}
                className="shrink-0 px-1 py-2 text-xs underline underline-offset-2"
              >
                회의 준비
              </Link>
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
