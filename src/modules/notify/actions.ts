"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/core/auth/session";
import { createContext, userContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { getRegistry } from "@/core/registry/current";
import {
  getProfileSettings,
  updateProfileSettings,
} from "@/core/settings/profile";
import { reminderSettingsSchema, scheduleReminders } from "./reminders";
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
  const { db, user } = await svc();
  const current =
    (
      (await getProfileSettings(db, user.id)) as {
        notifications?: Record<string, boolean>;
      }
    ).notifications ?? {};
  await updateProfileSettings(db, user.id, {
    notifications: { ...current, [kind]: enabled },
  } as never);
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
  await updateProfileSettings(ctx.db, ctx.userId, {
    reminders: reminderSettingsSchema.parse(input),
  });
  const cancelled = await ctx.db
    .from("jobs")
    .delete()
    .eq("user_id", ctx.userId)
    .eq("type", "notify.reminder")
    .eq("status", "pending");
  if (cancelled.error) throw cancelled.error;
  await scheduleReminders(ctx);
  revalidatePath("/settings");
}
