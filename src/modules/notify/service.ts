import webpush from "web-push";
import type { ServiceContext } from "@/core/contracts";
import type { Json } from "@/core/db/types.generated";
import { getProfileSettings } from "@/core/settings/profile";
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
    return new Set(
      (
        [
          "meeting_ready",
          "daily_brief",
          "weekly_review",
          "due_soon",
        ] as NotificationKind[]
      ).filter((k) => prefs[k] !== false),
    );
  }

  /** 사용자의 모든 구독에 전송. 410/404 는 구독 삭제. 실패는 로그만. */
  async function send(
    raw: PushPayload,
  ): Promise<{ sent: number; removed: number }> {
    const payload = pushPayloadSchema.parse(raw);
    if (!configured()) return { sent: 0, removed: 0 };
    if (!(await enabledKinds()).has(payload.kind))
      return { sent: 0, removed: 0 };
    const { data: subs } = await ctx.db
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", ctx.userId);
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
          console.warn(
            "[push] 전송 실패",
            status,
            e instanceof Error ? e.message : e,
          );
        }
      }
    }
    return { sent, removed };
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
    await ctx.db
      .from("push_subscriptions")
      .delete()
      .eq("user_id", ctx.userId)
      .eq("endpoint", endpoint);
  }
  async function count(): Promise<number> {
    const { count } = await ctx.db
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userId);
    return count ?? 0;
  }
  return { send, subscribe, unsubscribe, count, enabledKinds };
}
