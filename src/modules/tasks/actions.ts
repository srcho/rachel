"use server";
import { userContext } from "@/core/context";
import { rescheduleTask, scheduleTask, unscheduleTask } from "./scheduling";
import type { CreateCardInput, MoveCardInput, UpdateCardInput } from "./schema";
import { tasksService } from "./service";

async function svc() {
  return tasksService(await userContext());
}

/** Server Action 은 서비스 호출만 한다. 결과는 직렬화 가능한 행. */
export async function createCardAction(input: CreateCardInput) {
  return (await svc()).createCard(input);
}
export async function updateCardAction(id: string, patch: UpdateCardInput) {
  return (await (await svc()).updateCard(id, patch)).card;
}
export async function moveCardAction(id: string, input: MoveCardInput) {
  return (await (await svc()).moveCard(id, input)).card;
}
export async function completeCardAction(id: string) {
  return (await (await svc()).completeCard(id)).card;
}
export async function archiveCardAction(id: string, archived = true) {
  return (await svc()).archiveCard(id, archived);
}
export async function deleteCardAction(id: string) {
  return (await svc()).deleteCard(id);
}

export async function taskSlotsAction(durationMinutes: 30 | 60 | 90) {
  const ctx = await userContext();
  const tool = ctx.registry.tools()["calendar.findFreeSlots"];
  if (!tool) throw new Error("캘린더를 사용할 수 없어요");
  const from = new Date(Math.ceil(ctx.now.getTime() / 300_000) * 300_000);
  const slots = (await tool.execute(
    {
      from: from.toISOString(),
      to: new Date(from.getTime() + 7 * 86_400_000).toISOString(),
      durationMinutes,
      limit: 3,
    },
    ctx,
  )) as Array<{ startAt: string; endAt: string }>;
  return { slots, timezone: ctx.timezone };
}
export async function scheduleTaskAction(
  input: Parameters<typeof scheduleTask>[1],
) {
  return scheduleTask(await userContext(), input);
}

export async function rescheduleTaskAction(
  input: Parameters<typeof rescheduleTask>[1],
) {
  return rescheduleTask(await userContext(), input);
}
export async function unscheduleTaskAction(id: string) {
  return unscheduleTask(await userContext(), id);
}
export async function planCardsAction(
  items: Array<{ id: string; expectedVersion: string }>,
  planDate: string | null,
) {
  return (await svc()).planCards(items, planDate);
}
