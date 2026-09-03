"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { registry } from "@/modules";
import { calendarService } from "./service";

async function svc() {
  const user = await requireUser();
  const db = await createServerSupabase();
  return calendarService(
    createContext({ db, userId: user.id, actor: "user", registry }),
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
