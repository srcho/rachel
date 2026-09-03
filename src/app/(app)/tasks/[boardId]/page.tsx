import { notFound } from "next/navigation";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { Page } from "@/core/ui/Page";
import { dayBounds } from "@/core/utils/date";
import { registry } from "@/modules";
import { eventService } from "@/modules/calendar/events";
import { tasksService } from "@/modules/tasks/service";
import { Board } from "@/modules/tasks/ui/Board";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ boardId: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { boardId } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const db = await createServerSupabase();
  const ctx = createContext({ db, userId: user.id, actor: "user", registry });
  const svc = tasksService(ctx);
  let view: Awaited<ReturnType<typeof svc.getBoardView>>;
  try {
    view = await svc.getBoardView(boardId, { showAllDone: sp.done === "all" });
  } catch {
    notFound();
  }
  // 캘린더 → 할 일(단방향): 오늘 일정을 보드 위 스트립에 읽기 전용으로. 앱 레이어라 두 모듈을 함께 쓴다.
  const { start, end } = dayBounds(ctx.now, ctx.timezone);
  const events = await eventService(ctx)
    .listEvents({ from: start, to: end, limit: 30 })
    .catch(() => []);
  const linked = new Set(
    view.cards.map((c) => c.calendar_event_id).filter(Boolean),
  );
  const todayEvents = events.map((e) => ({
    id: e.id,
    title: e.title,
    startAt: e.start_at,
    endAt: e.end_at,
    allDay: e.all_day,
    linked: linked.has(e.id),
  }));
  return (
    <Page width="full">
      <Board
        initial={view}
        userId={user.id}
        todayEvents={todayEvents}
        timezone={ctx.timezone}
        showAllDone={sp.done === "all"}
      />
    </Page>
  );
}
