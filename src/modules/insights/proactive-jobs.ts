import { z } from "zod";
import type {
  EventHandler,
  JobHandler,
  ServiceContext,
} from "@/core/contracts";
import { getAssistantPreferences } from "@/core/settings/assistant";
import { getProfileSettings } from "@/core/settings/profile";
import { notifyService } from "@/modules/notify/service";
import { proactiveService } from "./proactive";

export async function scheduleProactiveCheck(
  ctx: ServiceContext,
  immediate = false,
) {
  const at = immediate
    ? ctx.now
    : new Date(Math.floor(ctx.now.getTime() / 3600000) * 3600000 + 3600000);
  return ctx.enqueue({
    type: "notify.proactive",
    payload: {},
    runAt: at,
    dedupeKey: `proactive:check:${at.toISOString().slice(0, 13)}`,
  });
}
export const proactiveJob: JobHandler<Record<string, never>> = {
  schema: z.object({}),
  timeoutSec: 60,
  maxAttempts: 2,
  run: async (_payload, ctx) => {
    const prefs = await getAssistantPreferences(ctx.db, ctx.userId);
    if (prefs.initiative === "on_request") return;
    const svc = proactiveService(ctx);
    await svc.refresh();
    const { items } = await svc.list();
    const settings = await getProfileSettings(ctx.db, ctx.userId);
    for (const item of items) {
      // Meeting followups share the existing meeting-ready notification.
      // Waiting cards already have explicit due reminders unless disabled.
      if (
        item.kind === "preference" ||
        item.kind === "meeting_followup" ||
        (item.kind === "waiting_followup" &&
          settings.notifications?.due_soon !== false)
      )
        continue;
      await notifyService(ctx).send({
        kind: "proactive",
        title: item.title.slice(0, 80),
        body: item.body.slice(0, 200),
        url: item.href,
        tag: `suggestion:${item.id}`,
        suggestionId: item.id,
      });
    }
    await scheduleProactiveCheck(ctx);
  },
};
export const proactiveEventHandler: EventHandler = {
  on: [
    "calendar_event.created",
    "calendar_event.updated",
    "calendar_event.deleted",
    "calendar.synced",
    "task.created",
    "task.updated",
    "task.completed",
    "task.deleted",
    "meeting.summarized",
    "meeting.changed",
    "meeting.deleted",
    "memory.updated",
    "memory.forgotten",
  ],
  handle: async (event, ctx) => {
    if (event.type === "calendar_event.updated")
      await proactiveService(ctx).recordCorrection(event);
    await scheduleProactiveCheck(ctx, true);
  },
};
