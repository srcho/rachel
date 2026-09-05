import { z } from "zod";
import type { ServiceContext } from "@/core/contracts";
import { eventService } from "@/modules/calendar/events";
import {
  CalendarOverlapError,
  type EventRow,
} from "@/modules/calendar/repository";
import { tasksService } from "./service";

export const scheduleSchema = z.object({
  cardId: z.string().uuid(),
  startAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(5).max(480),
  expectedVersion: z.string().optional(),
});

function summary(event: EventRow, existing: boolean) {
  return {
    status: "scheduled" as const,
    id: event.id,
    existing,
    startAt: event.start_at,
    endAt: event.end_at,
    version: event.updated_at,
    syncStatus: event.sync_status,
    url: `/calendar?event=${event.id}`,
  };
}

async function taskAndEvent(
  ctx: ServiceContext,
  cardId: string,
  expectedVersion?: string,
) {
  const tasks = tasksService(ctx);
  const card = await tasks.getCard(cardId);
  if (!card || card.archived_at) throw new Error("할 일을 찾을 수 없어요");
  if (expectedVersion && card.updated_at !== expectedVersion)
    throw new Error("할 일이 변경됐어요. 최신 내용을 확인해 주세요.");
  const calendar = eventService(ctx);
  const linked = card.calendar_event_id
    ? await calendar.getEvent(card.calendar_event_id)
    : null;
  // Recover a block saved before the task-link write failed, including later generations.
  const { data, error } = await ctx.db
    .from("calendar_events")
    .select("*")
    .eq("user_id", ctx.userId)
    .like("creation_key", `task-time:${card.id}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const event =
    linked && !linked.deleted_at && linked.status !== "cancelled"
      ? linked
      : (data ?? linked);
  return { tasks, card, calendar, event };
}

/** UI and assistant share the same idempotent lifecycle and guarded calendar writes. */
export async function scheduleTask(
  ctx: ServiceContext,
  raw: z.input<typeof scheduleSchema>,
) {
  const input = scheduleSchema.parse(raw);
  const {
    tasks,
    card,
    calendar,
    event: previous,
  } = await taskAndEvent(ctx, input.cardId, input.expectedVersion);
  if (previous && !previous.deleted_at && previous.status !== "cancelled") {
    if (card.calendar_event_id !== previous.id)
      await tasks.updateCard(
        card.id,
        { calendarEventId: previous.id },
        { expectedVersion: card.updated_at },
      );
    return summary(previous, true);
  }
  const endAt = new Date(
    Date.parse(input.startAt) + input.durationMinutes * 60_000,
  ).toISOString();
  const event = await calendar.createEvent(
    {
      creationKey: previous
        ? `task-time:${card.id}:${previous.id}`
        : `task-time:${card.id}`,
      title: card.title,
      startAt: input.startAt,
      endAt,
      description: `할 일: /tasks/${card.board_id}?card=${card.id}`,
    },
    { preventOverlap: true },
  );
  try {
    await tasks.updateCard(
      card.id,
      { calendarEventId: event.id },
      { expectedVersion: card.updated_at },
    );
  } catch (error) {
    // A concurrent retry may already have linked this exact block.
    if ((await tasks.getCard(card.id))?.calendar_event_id !== event.id)
      throw error;
  }
  return summary(event, !event.createdNow);
}

export async function rescheduleTask(
  ctx: ServiceContext,
  raw: z.input<typeof scheduleSchema>,
) {
  const input = scheduleSchema.parse(raw);
  const { card, calendar, event, tasks } = await taskAndEvent(
    ctx,
    input.cardId,
    input.expectedVersion,
  );
  if (!event || event.deleted_at || event.status === "cancelled")
    return scheduleTask(ctx, input);
  if (!event.creation_key?.startsWith(`task-time:${card.id}`))
    throw new Error(
      "이 연결은 할 일 시간 블록이 아니에요. 일정에서 직접 변경해 주세요.",
    );
  const endAt = new Date(
    Date.parse(input.startAt) + input.durationMinutes * 60_000,
  ).toISOString();
  const { event: moved } = await calendar.updateEvent(
    event.id,
    { startAt: input.startAt, endAt },
    event.updated_at,
    { preventOverlap: true },
  );
  if (card.calendar_event_id !== moved.id)
    await tasks.updateCard(
      card.id,
      { calendarEventId: moved.id },
      { expectedVersion: card.updated_at },
    );
  return summary(moved, true);
}

export async function unscheduleTask(
  ctx: ServiceContext,
  cardId: string,
  expectedVersion?: string,
) {
  const { card, calendar, event, tasks } = await taskAndEvent(
    ctx,
    cardId,
    expectedVersion,
  );
  if (event && !event.creation_key?.startsWith(`task-time:${card.id}`))
    throw new Error(
      "이 연결은 할 일 시간 블록이 아니에요. 일정에서 직접 변경해 주세요.",
    );
  const deleted =
    event && !event.deleted_at
      ? await calendar.deleteEvent(event.id, event.updated_at)
      : event;
  if (card.calendar_event_id)
    await tasks.updateCard(
      card.id,
      { calendarEventId: null },
      { expectedVersion: card.updated_at },
    );
  return {
    cardId,
    id: deleted?.id ?? null,
    changed: Boolean(event && !event.deleted_at),
    syncStatus: deleted?.sync_status ?? null,
    scheduled: false,
  };
}

/** Tool result reports a rejected slot with actionable alternatives, not success. */
export async function scheduleTaskResult(
  ctx: ServiceContext,
  input: z.input<typeof scheduleSchema>,
  move = false,
) {
  try {
    return await (move ? rescheduleTask : scheduleTask)(ctx, input);
  } catch (error) {
    if (!(error instanceof CalendarOverlapError)) throw error;
    let alternatives: Array<{ startAt: string; endAt: string }> = [];
    let alternativesError: string | null = null;
    try {
      alternatives = await eventService(ctx).findFreeSlots({
        from: input.startAt,
        to: new Date(Date.parse(input.startAt) + 7 * 86_400_000).toISOString(),
        durationMinutes: input.durationMinutes,
        limit: 3,
      });
    } catch (failure) {
      alternativesError =
        failure instanceof Error ? failure.message : "빈 시간 조회 실패";
    }
    return {
      status: "conflict" as const,
      changed: false,
      cardId: input.cardId,
      conflicts: error.conflicts.map((event) => ({
        id: event.id,
        title: event.title,
        startAt: event.start_at,
        endAt: event.end_at,
      })),
      alternatives,
      alternativesError,
    };
  }
}
