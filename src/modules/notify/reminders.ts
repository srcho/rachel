import { z } from "zod";
import type { JobHandler, ServiceContext } from "@/core/contracts";
import { getProfileSettings } from "@/core/settings/profile";
import { dayBounds, localYmd } from "@/core/utils/date";
import { notifyService } from "./service";

export {
  afterQuietHours,
  DEFAULT_REMINDERS,
  reminderSettingsSchema,
} from "./policy";

import {
  afterQuietHours,
  DEFAULT_REMINDERS,
  reminderSettingsSchema,
  wallClock,
} from "./policy";

async function preferences(ctx: ServiceContext) {
  const [settings, profile, controls] = await Promise.all([
    getProfileSettings(ctx.db, ctx.userId),
    ctx.db
      .from("profiles")
      .select("timezone")
      .eq("id", ctx.userId)
      .maybeSingle(),
    ctx.db
      .from("notification_controls")
      .select("snoozed_until")
      .eq("user_id", ctx.userId)
      .maybeSingle(),
  ]);
  if (profile.error) throw profile.error;
  if (controls.error) throw controls.error;
  return {
    snoozedUntil: controls.data?.snoozed_until,
    timezone: profile.data?.timezone ?? ctx.timezone,
    ...DEFAULT_REMINDERS,
    ...reminderSettingsSchema.partial().parse(settings.reminders ?? {}),
  };
}
const reminderPayload = z.object({
  target: z.enum(["card", "event", "morning"]),
  id: z.string().uuid().optional(),
  dueAt: z.string().optional(),
  date: z.string().date().optional(),
});
type ReminderPayload = z.infer<typeof reminderPayload>;
async function enqueue(
  ctx: ServiceContext,
  payload: ReminderPayload,
  at: Date,
) {
  const key = `reminder:${payload.target}:${payload.id ?? payload.date}:${payload.dueAt ?? ""}`;
  const { data, error } = await ctx.db
    .from("jobs")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("dedupe_key", key)
    .in("status", ["running", "done"])
    .limit(1);
  if (error) throw error;
  if (data.length) return;
  await ctx.enqueue({
    type: "notify.reminder",
    payload,
    dedupeKey: key,
    runAt: at,
  });
}
async function allPages<T>(
  fetchPage: (
    offset: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await fetchPage(offset);
    if (result.error) throw result.error;
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
export async function scheduleReminders(ctx: ServiceContext) {
  const prefs = await preferences(ctx);
  ctx = { ...ctx, timezone: prefs.timezone };
  const until = new Date(ctx.now.getTime() + 8 * 86400000).toISOString();
  const [cards, events, calendars] = await Promise.all([
    allPages((offset) =>
      ctx.db
        .from("cards")
        .select("id,due_at,due_has_time")
        .eq("user_id", ctx.userId)
        .is("completed_at", null)
        .is("archived_at", null)
        .eq("due_has_time", true)
        .gte("due_at", ctx.now.toISOString())
        .lte("due_at", until)
        .order("id")
        .range(offset, offset + 499),
    ),
    allPages((offset) =>
      ctx.db
        .from("calendar_events")
        .select("id,start_at,google_has_reminders,calendar_id")
        .eq("user_id", ctx.userId)
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .eq("all_day", false)
        .gte("start_at", ctx.now.toISOString())
        .lte("start_at", until)
        .order("id")
        .range(offset, offset + 499),
    ),
    ctx.db
      .from("calendars")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("selected", true),
  ]);
  if (calendars.error) throw calendars.error;
  for (const c of cards)
    if (c.due_at)
      await enqueue(
        ctx,
        { target: "card", id: c.id, dueAt: c.due_at },
        afterQuietHours(
          new Date(
            Math.max(ctx.now.getTime(), Date.parse(c.due_at) - 10 * 60000),
          ),
          ctx.timezone,
          prefs.quietStart,
          prefs.quietEnd,
        ),
      );
  const selected = new Set(calendars.data?.map((c) => c.id));
  for (const event of events) {
    if (
      !selected.has(event.calendar_id) ||
      !shouldNotifyEvent(
        event.google_has_reminders,
        prefs.calendarAlongsideGoogle,
      )
    )
      continue;
    await enqueue(
      ctx,
      { target: "event", id: event.id, dueAt: event.start_at },
      afterQuietHours(
        new Date(
          Math.max(ctx.now.getTime(), Date.parse(event.start_at) - 10 * 60000),
        ),
        ctx.timezone,
        prefs.quietStart,
        prefs.quietEnd,
      ),
    );
  }
  const bounds = dayBounds(ctx.now, ctx.timezone);
  let morning = wallClock(
    localYmd(ctx.now, ctx.timezone),
    prefs.morningHour,
    ctx.timezone,
  );
  if (morning <= ctx.now)
    morning = wallClock(
      localYmd(new Date(bounds.end), ctx.timezone),
      prefs.morningHour,
      ctx.timezone,
    );
  morning = afterQuietHours(
    morning,
    ctx.timezone,
    prefs.quietStart,
    prefs.quietEnd,
  );
  await enqueue(
    ctx,
    { target: "morning", date: localYmd(morning, ctx.timezone) },
    morning,
  );
}
export function shouldNotifyEvent(
  googleHasReminders: boolean,
  alongside: boolean,
) {
  return alongside || !googleHasReminders;
}
export const reminderJob: JobHandler<ReminderPayload> = {
  schema: reminderPayload,
  timeoutSec: 30,
  maxAttempts: 3,
  run: async (payload, ctx) => {
    const prefs = await preferences(ctx);
    ctx = { ...ctx, timezone: prefs.timezone };
    let permittedAt = afterQuietHours(
      ctx.now,
      ctx.timezone,
      prefs.quietStart,
      prefs.quietEnd,
    );
    if (
      prefs.snoozedUntil &&
      Date.parse(prefs.snoozedUntil) > permittedAt.getTime()
    )
      permittedAt = new Date(prefs.snoozedUntil);
    if (permittedAt > ctx.now) {
      await ctx.enqueue({
        type: "notify.reminder",
        payload,
        dedupeKey: `quiet:${payload.target}:${payload.id ?? payload.date}:${payload.dueAt ?? ""}:${permittedAt.toISOString()}`,
        runAt: permittedAt,
      });
      return;
    }
    if (payload.target === "morning") {
      if (payload.date !== localYmd(ctx.now, ctx.timezone)) {
        await scheduleReminders(ctx);
        return;
      }
      const { end } = dayBounds(ctx.now, ctx.timezone);
      const { count, error } = await ctx.db
        .from("cards")
        .select("id", { count: "exact", head: true })
        .eq("user_id", ctx.userId)
        .is("completed_at", null)
        .is("archived_at", null)
        .eq("due_has_time", false)
        .lt("due_at", end);
      if (error) throw error;
      if (count)
        await notifyService(ctx).send({
          kind: "due_soon",
          title: "오늘 확인할 할 일",
          body: `오늘 마감·지난 마감 ${count}개를 확인해 주세요.`,
          url: "/today",
          tag: `morning:${localYmd(ctx.now, ctx.timezone)}`,
        });
      await scheduleReminders(ctx);
      return;
    }
    if (
      !payload.id ||
      (payload.dueAt &&
        ctx.now.getTime() - Date.parse(payload.dueAt) > 86400000)
    )
      return;
    if (payload.target === "card") {
      const { data: c, error } = await ctx.db
        .from("cards")
        .select(
          "id,board_id,title,due_at,due_has_time,completed_at,archived_at",
        )
        .eq("user_id", ctx.userId)
        .eq("id", payload.id)
        .maybeSingle();
      if (error) throw error;
      if (
        !c ||
        c.completed_at ||
        c.archived_at ||
        !c.due_has_time ||
        c.due_at !== payload.dueAt
      )
        return;
      await notifyService(ctx).send({
        kind: "due_soon",
        title: "할 일 마감 알림",
        body: c.title.slice(0, 200),
        url: `/tasks/${c.board_id}?card=${c.id}`,
        tag: `task:${c.id}`,
        taskId: c.id,
      });
    } else {
      const { data: e, error } = await ctx.db
        .from("calendar_events")
        .select(
          "id,title,start_at,deleted_at,status,google_has_reminders,calendar_id",
        )
        .eq("user_id", ctx.userId)
        .eq("id", payload.id)
        .maybeSingle();
      if (error) throw error;
      if (
        !e ||
        e.deleted_at ||
        e.status === "cancelled" ||
        e.start_at !== payload.dueAt ||
        !shouldNotifyEvent(
          e.google_has_reminders,
          prefs.calendarAlongsideGoogle,
        )
      )
        return;
      const calendar = await ctx.db
        .from("calendars")
        .select("selected")
        .eq("user_id", ctx.userId)
        .eq("id", e.calendar_id)
        .maybeSingle();
      if (calendar.error) throw calendar.error;
      if (!calendar.data?.selected) return;
      await notifyService(ctx).send({
        kind: "event_soon",
        title: "다가오는 일정",
        body: e.title.slice(0, 200),
        url: `/calendar?event=${e.id}`,
        tag: `event:${e.id}`,
      });
    }
  },
};
