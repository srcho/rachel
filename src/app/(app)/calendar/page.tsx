import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { dayBounds, localYmd } from "@/core/utils/date";
import { registry } from "@/modules";
import { eventService } from "@/modules/calendar/events";
import { addDays, startOfMonth, startOfWeek } from "@/modules/calendar/format";
import { calendarService } from "@/modules/calendar/service";
import {
  CalendarScreen,
  type CalendarView,
} from "@/modules/calendar/ui/CalendarScreen";

export const dynamic = "force-dynamic";

const VIEWS: CalendarView[] = ["agenda", "week", "month"];

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; event?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const db = await createServerSupabase();
  const ctx = createContext({ db, userId: user.id, actor: "user", registry });
  const view: CalendarView = VIEWS.includes(sp.view as CalendarView)
    ? (sp.view as CalendarView)
    : "week";
  const today = localYmd(ctx.now, ctx.timezone);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "")
    ? (sp.date as string)
    : today;

  // 뷰별 로드 범위(타임존 자정 기준)
  let fromYmd: string;
  let toYmd: string; // exclusive
  if (view === "agenda") {
    fromYmd = date;
    toYmd = addDays(date, 14);
  } else if (view === "week") {
    fromYmd = startOfWeek(date);
    toYmd = addDays(fromYmd, 7);
  } else {
    const first = startOfMonth(date);
    fromYmd = startOfWeek(first, 0);
    toYmd = addDays(fromYmd, 42); // 6주 그리드
  }
  const from = dayBounds(new Date(`${fromYmd}T12:00:00Z`), ctx.timezone).start;
  const to = dayBounds(new Date(`${toYmd}T12:00:00Z`), ctx.timezone).start;

  const svc = eventService(ctx);
  const [{ integration, calendars }, events] = await Promise.all([
    calendarService(ctx).status(),
    svc.listEvents({ from, to, limit: 200 }),
  ]);

  const selectedEvent = sp.event ? await svc.getEvent(sp.event) : null;
  return (
    <CalendarScreen
      view={view}
      explicitView={!!sp.view}
      selectedEvent={selectedEvent}
      lastSyncedAt={integration?.last_synced_at ?? null}
      date={date}
      today={today}
      timezone={ctx.timezone}
      connected={Boolean(integration && integration.status === "connected")}
      calendars={calendars.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        writable: c.writable,
        selected: c.selected,
        isPrimary: c.is_primary,
      }))}
      events={events}
      userId={user.id}
    />
  );
}
