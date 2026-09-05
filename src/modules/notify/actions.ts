"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/core/auth/session";
import { createContext, userContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { getRegistry } from "@/core/registry/current";
import { reminderSettingsSchema } from "./reminders";
import type { NotificationKind } from "./schema";
import { notifyService } from "./service";

async function svc() {
  const user = await requireUser();
  const db = await createServerSupabase();
  return {
    db,
    user,
    svc: notifyService(
      createContext({
        db,
        userId: user.id,
        actor: "user",
        registry: await getRegistry(),
      }),
    ),
  };
}

export async function setNotificationPrefAction(
  kind: NotificationKind,
  enabled: boolean,
) {
  const { svc: s } = await svc();
  await s.setPreferences({ notifications: { [kind]: enabled } });
  revalidatePath("/settings");
}

export async function unsubscribePushAction(endpoint: string) {
  const { svc: s } = await svc();
  await s.unsubscribe(endpoint);
  revalidatePath("/settings");
}

export async function sendTestPushAction() {
  const { svc: s } = await svc();
  return s.send({
    kind: "daily_brief",
    title: "레이첼 알림 테스트",
    body: "푸시가 잘 도착했어요.",
    url: "/settings",
  });
}

export async function setReminderSettingsAction(input: {
  quietStart: number;
  quietEnd: number;
  morningHour: number;
  calendarAlongsideGoogle: boolean;
}) {
  const ctx = await userContext();
  await notifyService(ctx).setPreferences({
    reminders: reminderSettingsSchema.parse(input),
  });
  revalidatePath("/settings");
}

export async function snoozeNotificationsAction(until: string | null) {
  const result = await notifyService(await userContext()).snooze(until);
  revalidatePath("/settings");
  return result;
}
export async function setSuggestionKindAction(
  kind: import("@/modules/insights/proactive-schema").SuggestionKind,
  enabled: boolean,
) {
  await (await import("@/modules/insights/proactive"))
    .proactiveService(await userContext())
    .setKindEnabled(kind, enabled);
  revalidatePath("/settings");
  revalidatePath("/today");
}
