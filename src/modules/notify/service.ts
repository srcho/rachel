import webpush from "web-push";
import type { ServiceContext } from "@/core/contracts";
import type { Json } from "@/core/db/types.generated";
import { getUserTimezone } from "@/core/settings/assistant";
import {
  getProfileSettings,
  updateProfileSettings,
} from "@/core/settings/profile";
import { NOTIFICATION_KINDS } from "./constants";
import {
  afterQuietHours,
  DEFAULT_REMINDERS,
  reminderSettingsSchema,
} from "./policy";
import {
  type NotificationKind,
  type PushPayload,
  pushPayloadSchema,
} from "./schema";

function configured(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:rachel@example.com",
    pub,
    priv,
  );
  return true;
}

export function notifyService(ctx: ServiceContext) {
  async function enabledKinds(): Promise<Set<NotificationKind>> {
    const s = await getProfileSettings(ctx.db, ctx.userId);
    const prefs =
      (s as { notifications?: Partial<Record<NotificationKind, boolean>> })
        .notifications ?? {};
    return new Set(NOTIFICATION_KINDS.filter((k) => prefs[k] !== false));
  }

  /** 사용자의 모든 구독에 전송. 410/404 는 구독 삭제. 실패는 로그만. */
  async function send(raw: PushPayload) {
    const payload = pushPayloadSchema.parse(raw);
    const noSend = (status: string) => ({ sent: 0, removed: 0, status });
    if (!configured()) return noSend("not_configured");
    if (!(await enabledKinds()).has(payload.kind)) return noSend("disabled");
    const settings = await getProfileSettings(ctx.db, ctx.userId);
    const timezone = await getUserTimezone(ctx.db, ctx.userId);
    const control = await ctx.db
      .from("notification_controls")
      .select("snoozed_until")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (control.error) throw control.error;
    const reminders = {
      ...DEFAULT_REMINDERS,
      ...reminderSettingsSchema.partial().parse(settings.reminders ?? {}),
    };
    let permittedAt = afterQuietHours(
      ctx.now,
      timezone,
      reminders.quietStart,
      reminders.quietEnd,
    );
    if (
      control.data?.snoozed_until &&
      Date.parse(control.data.snoozed_until) > permittedAt.getTime()
    )
      permittedAt = new Date(control.data.snoozed_until);
    if (permittedAt > ctx.now) {
      await ctx.enqueue({
        type: "notify.send",
        payload,
        dedupeKey: `notify:deferred:${payload.kind}:${payload.tag ?? ""}:${permittedAt.toISOString()}`,
        runAt: permittedAt,
      });
      return noSend("deferred");
    }
    const { data: subs, error } = await ctx.db
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", ctx.userId);
    if (error) throw error;
    if (!subs.length) return noSend("no_subscriptions");
    let deliveryId: string | null = null;
    if (payload.kind === "proactive" || payload.kind === "meeting_ready") {
      if (!payload.tag) throw new Error("중복 방지 키가 없는 알림이에요");
      const claim = await ctx.db.rpc("claim_notification_delivery", {
        p_user_id: ctx.userId,
        p_key: payload.tag,
        p_kind: payload.kind,
        p_at: ctx.now.toISOString(),
        p_timezone: timezone,
        p_suggestion_id: payload.suggestionId,
      });
      if (claim.error) throw claim.error;
      deliveryId = claim.data;
      if (!deliveryId) return noSend("suppressed");
    }
    let failed = 0;
    let sent = 0;
    let removed = 0;
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: s.keys as { p256dh: string; auth: string },
          },
          JSON.stringify(payload),
          { TTL: 3600, urgency: "normal" },
        );
        sent++;
        await ctx.db
          .from("push_subscriptions")
          .update({ last_used_at: new Date().toISOString(), failures: 0 })
          .eq("id", s.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await ctx.db.from("push_subscriptions").delete().eq("id", s.id);
          removed++;
        } else {
          await ctx.db
            .from("push_subscriptions")
            .update({ failures: s.failures + 1 })
            .eq("id", s.id);
          failed++;
          console.warn(
            "[push] 전송 실패",
            status,
            e instanceof Error ? e.message : e,
          );
        }
      }
    }
    if (deliveryId) {
      const updated = await ctx.db
        .from("notification_deliveries")
        .update({ status: failed ? "uncertain" : "sent", sent_count: sent })
        .eq("user_id", ctx.userId)
        .eq("id", deliveryId);
      if (updated.error) throw updated.error;
    }
    if (failed && !sent && !deliveryId)
      throw new Error("알림 전송을 다시 시도해야 해요");
    return { sent, removed, status: failed ? "uncertain" : "sent" };
  }

  async function subscribe(sub: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    userAgent?: string;
  }): Promise<void> {
    const { error } = await ctx.db.from("push_subscriptions").upsert(
      {
        user_id: ctx.userId,
        endpoint: sub.endpoint,
        keys: sub.keys as unknown as Json,
        user_agent: sub.userAgent ?? null,
      },
      { onConflict: "endpoint" },
    );
    if (error) throw error;
  }
  async function unsubscribe(endpoint: string): Promise<void> {
    const { error } = await ctx.db
      .from("push_subscriptions")
      .delete()
      .eq("user_id", ctx.userId)
      .eq("endpoint", endpoint);
    if (error) throw error;
  }
  async function count(): Promise<number> {
    const { count, error } = await ctx.db
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userId);
    if (error) throw error;
    return count ?? 0;
  }
  async function status() {
    const [settings, subscriptions, timezone, control] = await Promise.all([
      getProfileSettings(ctx.db, ctx.userId),
      count(),
      getUserTimezone(ctx.db, ctx.userId),
      ctx.db
        .from("notification_controls")
        .select("*")
        .eq("user_id", ctx.userId)
        .maybeSingle(),
    ]);
    if (control.error) throw control.error;
    return {
      configured: Boolean(
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
          process.env.VAPID_PRIVATE_KEY,
      ),
      subscriptions,
      devicePermission: "requires_browser_action",
      href: "/settings",
      timezone,
      notifications: Object.fromEntries(
        NOTIFICATION_KINDS.map((kind) => [
          kind,
          settings.notifications?.[kind] !== false,
        ]),
      ),
      reminders: { ...DEFAULT_REMINDERS, ...settings.reminders },
      snoozedUntil: control.data?.snoozed_until ?? null,
      disabledSuggestionKinds: control.data?.disabled_suggestion_kinds ?? [],
    };
  }
  async function setPreferences(input: {
    notifications?: Partial<Record<NotificationKind, boolean>>;
    reminders?: Partial<import("zod").infer<typeof reminderSettingsSchema>>;
  }) {
    const patch = {
      ...(input.notifications ? { notifications: input.notifications } : {}),
      ...(input.reminders
        ? {
            reminders: reminderSettingsSchema.partial().parse(input.reminders),
          }
        : {}),
    };
    await updateProfileSettings(ctx.db, ctx.userId, patch);
    if (input.reminders) {
      const cancelled = await ctx.db
        .from("jobs")
        .delete()
        .eq("user_id", ctx.userId)
        .eq("type", "notify.reminder")
        .eq("status", "pending");
      if (cancelled.error) throw cancelled.error;
      await (await import("./reminders")).scheduleReminders(ctx);
    }
    return status();
  }
  async function snooze(until: string | null) {
    if (
      until &&
      (!Number.isFinite(Date.parse(until)) ||
        Date.parse(until) <= ctx.now.getTime() ||
        Date.parse(until) > ctx.now.getTime() + 30 * 86400000)
    )
      throw new Error("30일 안의 미래 시각으로 미뤄 주세요");
    const { error } = await ctx.db
      .from("notification_controls")
      .upsert({ user_id: ctx.userId, snoozed_until: until });
    if (error) throw error;
    return { snoozedUntil: until, changed: true };
  }
  return {
    send,
    subscribe,
    unsubscribe,
    count,
    enabledKinds,
    status,
    setPreferences,
    snooze,
  };
}
