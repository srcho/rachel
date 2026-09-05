import { notFound } from "next/navigation";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { Page } from "@/core/ui/Page";
import { dayBounds, localYmd } from "@/core/utils/date";
import { registry } from "@/modules";
import { eventService } from "@/modules/calendar/events";
import { addDays } from "@/modules/calendar/format";
import {
  expandOccurrences,
  occurrenceLabel,
} from "@/modules/calendar/occurrences";
import { tasksService } from "@/modules/tasks/service";
import { Board } from "@/modules/tasks/ui/Board";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ boardId: string }>;
  searchParams: Promise<{ done?: string; card?: string; archived?: string }>;
}) {
  const { boardId } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const db = await createServerSupabase();
  const ctx = createContext({ db, userId: user.id, actor: "user", registry });
  const svc = tasksService(ctx);
  let view: Awaited<ReturnType<typeof svc.getBoardView>>;
  try {
    view = await svc.getBoardView(boardId, {
      showAllDone: sp.done === "all",
      archived: sp.archived === "1",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "보드를 찾을 수 없어요")
      notFound();
    throw error;
  }
  const selected = sp.card ? await svc.getCard(sp.card) : null;
  // 캘린더 → 할 일(단방향): 오늘 일정을 보드 위 스트립에 읽기 전용으로. 앱 레이어라 두 모듈을 함께 쓴다.
  const { start, end } = dayBounds(ctx.now, ctx.timezone);
  let calendarError = false;
  const events = await eventService(ctx)
    .listEvents({ from: start, to: end, limit: 30 })
    .catch((error) => {
      console.error("[tasks] today events", error);
      calendarError = true;
      return [];
    });
  const linked = new Set(
    view.cards.map((c) => c.calendar_event_id).filter(Boolean),
  );
  // 오늘을 덮는 조각 기준(여러 날 일정은 "계속"/"→ 종료" 라벨, 드롭 시 마감은 오늘)
  const todayYmd = localYmd(ctx.now, ctx.timezone);
  const todayEvents = (
    expandOccurrences(events, todayYmd, addDays(todayYmd, 1), ctx.timezone).get(
      todayYmd,
    ) ?? []
  ).map((o) => ({
    id: o.event.id,
    title: o.event.title,
    label: occurrenceLabel(o, ctx.timezone),
    dueAt: o.isStart ? o.event.start_at : start,
    dueHasTime: o.isStart && !o.event.all_day,
    linked: linked.has(o.event.id),
  }));
  return (
    <Page width="full">
      <Board
        initial={view}
        userId={user.id}
        todayEvents={todayEvents}
        calendarError={calendarError}
        timezone={ctx.timezone}
        showAllDone={sp.done === "all"}
        archived={sp.archived === "1"}
        selectedCard={selected?.board_id === boardId ? selected : null}
      />
    </Page>
  );
}
