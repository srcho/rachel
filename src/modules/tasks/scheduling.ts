import { z } from "zod";
import type { ServiceContext } from "@/core/contracts";
import { tasksService } from "./service";

const scheduleSchema = z.object({
  cardId: z.string().uuid(),
  startAt: z.string().datetime({ offset: true }),
  durationMinutes: z.union([z.literal(30), z.literal(60), z.literal(90)]),
});
export async function scheduleTask(
  ctx: ServiceContext,
  raw: z.input<typeof scheduleSchema>,
) {
  const input = scheduleSchema.parse(raw);
  const tasks = tasksService(ctx);
  const card = await tasks.getCard(input.cardId);
  if (!card || card.archived_at) throw new Error("할 일을 찾을 수 없어요");
  if (card.calendar_event_id)
    return { id: card.calendar_event_id, existing: true };
  // A previous attempt may have created the event before linking the task failed.
  const { data: previous, error } = await ctx.db
    .from("calendar_events")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("creation_key", `task-time:${card.id}`)
    .maybeSingle();
  if (error) throw error;
  if (previous) {
    await tasks.updateCard(card.id, { calendarEventId: previous.id });
    return { id: previous.id, existing: true };
  }
  const find = ctx.registry.tools()["calendar.findFreeSlots"];
  const create = ctx.registry.tools()["calendar.createEvent"];
  if (!find || !create) throw new Error("캘린더를 사용할 수 없어요");
  const endAt = new Date(
    Date.parse(input.startAt) + input.durationMinutes * 60_000,
  ).toISOString();
  const slots = (await find.execute(
    {
      from: input.startAt,
      to: endAt,
      durationMinutes: input.durationMinutes,
      limit: 1,
    },
    ctx,
  )) as Array<{ startAt: string }>;
  if (slots.length === 0)
    throw new Error(
      "이 시간에 다른 일정이 생겼어요. 가능한 시간을 다시 확인해 주세요.",
    );
  const event = (await create.execute(
    {
      creationKey: `task-time:${card.id}`,
      title: card.title,
      startAt: input.startAt,
      endAt,
      description: `할 일: /tasks/${card.board_id}?card=${card.id}`,
    },
    ctx,
  )) as { id: string };
  await tasks.updateCard(card.id, { calendarEventId: event.id });
  return { id: event.id, existing: false };
}
