"use server";
import { revalidatePath } from "next/cache";
import { userContext } from "@/core/context";
import { eventService } from "./events";
import { gtasksService } from "./gtasks";
import type { CreateEventInput, UpdateEventInput } from "./schema";
import { calendarService } from "./service";

export async function setCalendarSelectedAction(
  calendarId: string,
  selected: boolean,
) {
  await calendarService(await userContext()).setSelected(calendarId, selected);
  revalidatePath("/settings");
}

export async function disconnectGoogleAction() {
  await calendarService(await userContext()).disconnect();
  revalidatePath("/settings");
}

export async function refreshCalendarsAction() {
  const s = calendarService(await userContext());
  const { integration } = await s.status();
  if (integration) await s.refreshCalendarList(integration.id);
  revalidatePath("/settings");
}

export async function createEventAction(input: CreateEventInput) {
  return eventService(await userContext()).createEvent(input);
}
export async function updateEventAction(id: string, patch: UpdateEventInput) {
  return (await eventService(await userContext()).updateEvent(id, patch)).event;
}
export async function deleteEventAction(id: string) {
  return eventService(await userContext()).deleteEvent(id);
}
export async function syncNowAction() {
  const ctx = await userContext();
  await ctx.enqueue({
    type: "calendar.sync",
    payload: {},
    dedupeKey: `calendar.sync:${ctx.userId}`,
  });
}

/** 설정: Google Tasks 미러 켜기/끄기(켜면 마감 있는 카드 백필) */
export async function setGtasksEnabledAction(enabled: boolean) {
  const st = await gtasksService(await userContext()).setEnabled(enabled);
  revalidatePath("/settings");
  return st;
}

/** 설정: Google 쪽 변경 지금 가져오기 */
export async function pullGtasksAction() {
  const r = await gtasksService(await userContext()).pull();
  revalidatePath("/settings");
  revalidatePath("/tasks");
  return r;
}

export async function calendarConflictAction(id: string) {
  return eventService(await userContext()).conflictVersions(id);
}
export async function resolveCalendarConflictAction(
  id: string,
  choice: "local" | "remote",
  localVersion: string,
  remoteEtag: string,
) {
  const result = await eventService(await userContext()).resolveConflict(
    id,
    choice,
    localVersion,
    remoteEtag,
  );
  revalidatePath("/calendar");
  return result;
}
export async function retryEventPushAction(id: string) {
  const result = await eventService(await userContext()).retryPush(id);
  revalidatePath("/calendar");
  return result;
}
