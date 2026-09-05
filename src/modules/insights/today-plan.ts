import type { ServiceContext } from "@/core/contracts";
import { getSchedulingPreferences } from "@/core/settings/assistant";
import { dayBounds, localYmd, tzOffsetMs } from "@/core/utils/date";
import { eventService } from "@/modules/calendar/events";
import { addDays } from "@/modules/calendar/format";
import type { EventRow } from "@/modules/calendar/repository";
import type { CardRow } from "@/modules/tasks/repository";
import { tasksService } from "@/modules/tasks/service";

/** Merge busy intervals so overlapping appointments never subtract time twice. */
export function remainingCapacity(
  from: number,
  to: number,
  events: Pick<EventRow, "start_at" | "end_at" | "is_busy" | "status">[],
) {
  if (to <= from) return 0;
  let cursor = from;
  let free = 0;
  const intervals = events
    .filter((e) => e.is_busy && e.status !== "cancelled")
    .map(
      (e) =>
        [
          Math.max(from, Date.parse(e.start_at)),
          Math.min(to, Date.parse(e.end_at)),
        ] as const,
    )
    .filter(([start, end]) => start < end)
    .sort((a, b) => a[0] - b[0]);
  for (const [start, end] of intervals) {
    free += Math.max(0, start - cursor);
    cursor = Math.max(cursor, end);
  }
  return Math.floor((free + Math.max(0, to - cursor)) / 60_000);
}

export async function getTodayPlan(ctx: ServiceContext) {
  const today = localYmd(ctx.now, ctx.timezone);
  const tomorrow = addDays(today, 1);
  const bounds = dayBounds(ctx.now, ctx.timezone);
  const tasks = tasksService(ctx);
  const calendar = eventService(ctx);
  const cards: CardRow[] = [];
  for (let cursor = 0; ; ) {
    const page = await tasks.listCardsPage({ limit: 200, cursor });
    cards.push(...page.items);
    if (page.nextCursor === null) break;
    cursor = page.nextCursor;
  }
  const preferences = await getSchedulingPreferences(ctx.db, ctx.userId);
  const events: EventRow[] = [];
  let calendarStatus: Pick<
    Awaited<ReturnType<typeof calendar.connectionStatus>>,
    "connected" | "oauthStatus" | "selectedCount" | "complete" | "coverage"
  > | null = null;
  let calendarError: string | null = null;
  try {
    for (let cursor: string | undefined; ; ) {
      const page = await calendar.listEventsPage({
        from: bounds.start,
        to: bounds.end,
        limit: 200,
        cursor,
      });
      events.push(...page.events);
      calendarStatus = {
        connected: page.connected,
        oauthStatus: page.oauthStatus,
        selectedCount: page.selectedCount,
        complete: page.complete,
        coverage: page.coverage,
      };
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
  } catch (error) {
    calendarError =
      error instanceof Error ? error.message : "일정을 확인하지 못했어요";
  }
  const localHour = (hour: number) => {
    const guess = new Date(`${today}T00:00:00Z`);
    guess.setUTCHours(hour);
    let ms = guess.getTime() - tzOffsetMs(ctx.timezone, guess);
    ms = guess.getTime() - tzOffsetMs(ctx.timezone, new Date(ms));
    return ms;
  };
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const isWorkday =
    preferences.includeWeekends || (weekday !== 0 && weekday !== 6);
  const workStart = Math.max(
    preferences.workStartHour ?? 9,
    preferences.preferredStartHour ?? 0,
  );
  const workEnd = Math.min(
    preferences.workEndHour ?? 19,
    preferences.preferredEndHour ?? 24,
  );
  const from = Math.max(ctx.now.getTime(), localHour(workStart));
  const to = localHour(workEnd);
  const buffer = (preferences.bufferMinutes ?? 0) * 60_000;
  const availableMinutes =
    calendarStatus?.complete && !calendarError
      ? isWorkday
        ? remainingCapacity(
            from,
            to,
            events.map((e) => ({
              ...e,
              start_at: new Date(Date.parse(e.start_at) - buffer).toISOString(),
              end_at: new Date(Date.parse(e.end_at) + buffer).toISOString(),
            })),
          )
        : 0
      : null;
  const candidates = cards
    .filter((card) => !card.plan_date || card.plan_date <= today)
    .sort(
      (a, b) =>
        Number(b.plan_date === today) - Number(a.plan_date === today) ||
        Number(
          Boolean(b.due_at && Date.parse(b.due_at) < Date.parse(bounds.end)),
        ) -
          Number(
            Boolean(a.due_at && Date.parse(a.due_at) < Date.parse(bounds.end)),
          ) ||
        a.priority - b.priority ||
        (a.due_at ?? "z").localeCompare(b.due_at ?? "z"),
    );
  const project = (card: CardRow) => ({
    id: card.id,
    title: card.title,
    boardId: card.board_id,
    version: card.updated_at,
    planDate: card.plan_date,
    dueAt: card.due_at,
    dueHasTime: card.due_has_time,
    calendarEventId: card.calendar_event_id,
    url: `/tasks/${card.board_id}?card=${card.id}`,
  });
  let unallocated = availableMinutes;
  const outcomes = [];
  for (const card of candidates) {
    if (outcomes.length === 3) break;
    const block = events.find(
      (e) =>
        e.creation_key?.startsWith(`task-time:${card.id}`) &&
        e.id === card.calendar_event_id &&
        Date.parse(e.end_at) > ctx.now.getTime(),
    );
    const estimatedMinutes = block
      ? Math.max(
          0,
          Math.round(
            (Date.parse(block.end_at) -
              Math.max(ctx.now.getTime(), Date.parse(block.start_at))) /
              60_000,
          ),
        )
      : 60;
    if (!block && unallocated !== null && unallocated < estimatedMinutes)
      continue;
    if (!block && unallocated !== null) unallocated -= estimatedMinutes;
    outcomes.push({
      ...project(card),
      estimatedMinutes,
      estimateConfirmed: Boolean(block),
      reason:
        card.plan_date === today
          ? "오늘 계획"
          : card.due_at && Date.parse(card.due_at) < Date.parse(bounds.start)
            ? "지난 마감"
            : card.due_at && Date.parse(card.due_at) < Date.parse(bounds.end)
              ? "오늘 마감"
              : "우선순위",
    });
  }
  return {
    today,
    tomorrow,
    timezone: ctx.timezone,
    asOf: ctx.now.toISOString(),
    availableMinutes,
    calendarStatus,
    calendarError,
    workStart,
    workEnd,
    outcomes,
    planned: cards.filter((c) => c.plan_date === today).map(project),
    deadlines: cards
      .filter((c) => c.due_at && Date.parse(c.due_at) < Date.parse(bounds.end))
      .map(project),
    fixedEvents: events
      .filter(
        (e) =>
          !e.creation_key?.startsWith("task-time:") &&
          e.is_busy &&
          e.status !== "cancelled",
      )
      .map((e) => ({
        id: e.id,
        title: e.title,
        startAt: e.start_at,
        endAt: e.end_at,
      })),
    tasksComplete: true,
  };
}
export type TodayPlanData = Awaited<ReturnType<typeof getTodayPlan>>;
