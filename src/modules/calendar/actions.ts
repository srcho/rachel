"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { getRegistry } from "@/core/registry/current";
import { eventService } from "./events";
import { gtasksService } from "./gtasks";
import type { CreateEventInput, UpdateEventInput } from "./schema";
import { calendarService } from "./service";

async function svc() {
  const user = await requireUser();
  const db = await createServerSupabase();
  return calendarService(
    createContext({
      db,
      userId: user.id,
      actor: "user",
      registry: await getRegistry(),
    }),
  );
}

export async function setCalendarSelectedAction(
  calendarId: string,
  selected: boolean,
) {
  await (await svc()).setSelected(calendarId, selected);
  revalidatePath("/settings");
}

export async function disconnectGoogleAction() {
  await (await svc()).disconnect();
  revalidatePath("/settings");
}

export async function refreshCalendarsAction() {
  const s = await svc();
  const { integration } = await s.status();
  if (integration) await s.refreshCalendarList(integration.id);
  revalidatePath("/settings");
}

async function events() {
  const user = await requireUser();
  const db = await createServerSupabase();
  return eventService(
    createContext({
      db,
      userId: user.id,
      actor: "user",
      registry: await getRegistry(),
    }),
  );
}
export async function createEventAction(input: CreateEventInput) {
  return (await events()).createEvent(input);
}
export async function updateEventAction(id: string, patch: UpdateEventInput) {
  return (await (await events()).updateEvent(id, patch)).event;
}
export async function deleteEventAction(id: string) {
  await (await events()).deleteEvent(id);
}
export async function syncNowAction() {
  const user = await requireUser();
  const db = await createServerSupabase();
  const ctx = createContext({
    db,
    userId: user.id,
    actor: "user",
    registry: await getRegistry(),
  });
  await ctx.enqueue({
    type: "calendar.sync",
    payload: {},
    dedupeKey: `calendar.sync:${user.id}`,
  });
}

async function gtasksCtx() {
  const user = await requireUser();
  const db = await createServerSupabase();
  return createContext({
    db,
    userId: user.id,
    actor: "user",
    registry: await getRegistry(),
  });
}

/** 설정: Google Tasks 미러 켜기/끄기(켜면 마감 있는 카드 백필) */
export async function setGtasksEnabledAction(enabled: boolean) {
  const st = await gtasksService(await gtasksCtx()).setEnabled(enabled);
  revalidatePath("/settings");
  return st;
}

/** 설정: Google 쪽 변경 지금 가져오기 */
export async function pullGtasksAction() {
  const r = await gtasksService(await gtasksCtx()).pull();
  revalidatePath("/settings");
  revalidatePath("/tasks");
  return r;
}
