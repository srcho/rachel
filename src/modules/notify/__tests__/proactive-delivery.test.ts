import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { ServiceContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { updateProfileSettings } from "@/core/settings/profile";
import { proactiveService } from "@/modules/insights/proactive";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { notifyService } from "../service";

const push = vi.hoisted(() => vi.fn(async () => ({ statusCode: 201 })));
vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: push },
}));
const available = await localSupabaseAvailable();
describe.skipIf(!available)(
  "proactive push policy and durable attempts",
  () => {
    let user: Awaited<ReturnType<typeof testUser>>;
    let ctx: ServiceContext;
    const queued: unknown[] = [];
    beforeAll(async () => {
      vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "local-test");
      vi.stubEnv("VAPID_PRIVATE_KEY", "local-test");
      user = await testUser("proactive-push");
      ctx = {
        db: user.db,
        userId: user.id,
        actor: "system",
        now: new Date("2026-09-05T00:00:00Z"),
        timezone: "Asia/Seoul",
        registry: createRegistry(() => []),
        emit: async () => {},
        enqueue: async (job) => {
          queued.push(job);
          return "job";
        },
      };
      await notifyService(ctx).subscribe({
        endpoint: "https://push.test.local/device",
        keys: { p256dh: "test", auth: "test" },
      });
    });
    afterAll(async () => {
      await user?.cleanup();
      vi.unstubAllEnvs();
    });
    beforeEach(async () => {
      push.mockClear();
      queued.length = 0;
      for (const table of [
        "notification_deliveries",
        "assistant_suggestions",
        "notification_controls",
      ] as const) {
        const result = await user.db
          .from(table)
          .delete()
          .eq("user_id", user.id);
        if (result.error) throw result.error;
      }
      await user.db
        .from("profiles")
        .update({ settings: {}, timezone: "Asia/Seoul" })
        .eq("id", user.id);
    });
    async function suggestion(index: number) {
      const { data, error } = await user.db
        .from("assistant_suggestions")
        .insert({
          user_id: user.id,
          dedupe_key: `test:${index}`,
          kind: "time_conflict",
          title: "시간 충돌",
          body: "확인할 충돌",
          href: "/today",
        })
        .select("*")
        .single();
      if (error) throw error;
      return {
        kind: "proactive" as const,
        title: data.title,
        body: data.body,
        url: data.href,
        tag: `suggestion:${data.id}`,
        suggestionId: data.id,
      };
    }
    it("A34 atomically allows at most two extra pushes per local day, never spends explicit reminder allowance", async () => {
      const payloads = await Promise.all([0, 1, 2, 3].map(suggestion));
      const results = await Promise.all(
        payloads.map((payload) => notifyService(ctx).send(payload)),
      );
      expect(results.reduce((sum, r) => sum + r.sent, 0)).toBe(2);
      expect(push).toHaveBeenCalledTimes(2);
      await Promise.all(
        payloads.map((payload) => notifyService(ctx).send(payload)),
      );
      expect(push).toHaveBeenCalledTimes(2);
      expect(
        await notifyService(ctx).send({
          kind: "due_soon",
          title: "명시적 마감 알림",
          body: "예약한 마감",
          url: "/today",
        }),
      ).toMatchObject({ sent: 1 });
      expect(push).toHaveBeenCalledTimes(3);
      const next = await suggestion(4);
      expect(
        await notifyService({
          ...ctx,
          now: new Date("2026-09-06T00:00:00Z"),
        }).send(next),
      ).toMatchObject({ sent: 1 });
    });
    it("defers quiet/snoozed sends without spending slots and suppresses disabled, dismissed, or on-request suggestions", async () => {
      const payload = await suggestion(1);
      expect(
        await notifyService({
          ...ctx,
          now: new Date("2026-09-05T14:00:00Z"),
        }).send(payload),
      ).toMatchObject({ status: "deferred" });
      expect(push).not.toHaveBeenCalled();
      expect(queued).toContainEqual(
        expect.objectContaining({ runAt: new Date("2026-09-05T23:00:00Z") }),
      );
      await notifyService(ctx).snooze("2026-09-05T01:00:00Z");
      expect(await notifyService(ctx).send(payload)).toMatchObject({
        status: "deferred",
      });
      await notifyService(ctx).snooze(null);
      await updateProfileSettings(user.db, user.id, {
        assistant: { initiative: "on_request" },
      });
      expect(await notifyService(ctx).send(payload)).toMatchObject({
        status: "suppressed",
      });
      await updateProfileSettings(user.db, user.id, {
        assistant: { initiative: "important" },
      });
      await proactiveService(ctx).setKindEnabled("time_conflict", false);
      expect(await notifyService(ctx).send(payload)).toMatchObject({
        status: "suppressed",
      });
      await proactiveService(ctx).setKindEnabled("time_conflict", true);
      await user.db
        .from("assistant_suggestions")
        .update({ status: "dismissed" })
        .eq("id", payload.suggestionId);
      expect(await notifyService(ctx).send(payload)).toMatchObject({
        status: "suppressed",
      });
      expect(push).not.toHaveBeenCalled();
      const ledger = await user.db
        .from("notification_deliveries")
        .select("id")
        .eq("user_id", user.id);
      expect(ledger.data).toHaveLength(0);
    });
    it("does not duplicate initial/final meeting-ready pushes or retry uncertain network sends", async () => {
      const ready = {
        kind: "meeting_ready" as const,
        title: "회의 정리 완료",
        body: "요약 준비",
        url: "/meetings/test",
        tag: "meeting:test",
      };
      await Promise.all([
        notifyService(ctx).send(ready),
        notifyService(ctx).send({ ...ready, body: "최종 정리 완료" }),
      ]);
      expect(push).toHaveBeenCalledTimes(1);
      push.mockRejectedValueOnce(new Error("network response lost"));
      const payload = await suggestion(1);
      const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(await notifyService(ctx).send(payload)).toMatchObject({
        sent: 0,
        status: "uncertain",
      });
      expect(await notifyService(ctx).send(payload)).toMatchObject({
        status: "suppressed",
      });
      expect(push).toHaveBeenCalledTimes(2);
      warning.mockRestore();
    });
    it("round trips notification settings, reminder fields and browser permission boundary", async () => {
      const status = await notifyService(ctx).setPreferences({
        notifications: { proactive: false, event_soon: false },
        reminders: { quietStart: 21 },
      });
      expect(status).toMatchObject({
        subscriptions: 1,
        devicePermission: "requires_browser_action",
        notifications: { proactive: false, event_soon: false, due_soon: true },
        reminders: { quietStart: 21, quietEnd: 8, morningHour: 9 },
      });
      expect(queued).toContainEqual(
        expect.objectContaining({ type: "notify.reminder" }),
      );
      expect(await notifyService(ctx).send(await suggestion(1))).toMatchObject({
        status: "disabled",
      });
    });
    it("preserves independent notification and reminder changes across a forced CAS collision", async () => {
      async function concurrent(
        a: Parameters<ReturnType<typeof notifyService>["setPreferences"]>[0],
        b: Parameters<ReturnType<typeof notifyService>["setPreferences"]>[0],
      ) {
        let arrivals = 0;
        let release!: () => void;
        const barrier = new Promise<void>((resolve) => {
          release = resolve;
        });
        const db = new Proxy(ctx.db, {
          get(target, key) {
            if (key !== "from") return Reflect.get(target, key);
            return (table: string) => {
              const query = target.from(table as "profiles");
              if (table !== "profiles") return query;
              const select = query.select.bind(query);
              query.select = ((...args: Parameters<typeof select>) => {
                const selected = select(...args);
                if (args[0] === "settings,updated_at") {
                  const single = selected.single.bind(selected);
                  selected.single = (async () => {
                    const result = await single();
                    if (arrivals < 2) {
                      arrivals++;
                      if (arrivals === 2) release();
                      await barrier;
                    }
                    return result;
                  }) as unknown as typeof selected.single;
                }
                return selected;
              }) as typeof query.select;
              return query;
            };
          },
        });
        const svc = notifyService({ ...ctx, db });
        await Promise.all([svc.setPreferences(a), svc.setPreferences(b)]);
        return svc.status();
      }
      expect(
        await concurrent(
          { notifications: { proactive: false } },
          { notifications: { due_soon: false } },
        ),
      ).toMatchObject({ notifications: { proactive: false, due_soon: false } });
      expect(
        await concurrent(
          { reminders: { quietStart: 20 } },
          { reminders: { morningHour: 10 } },
        ),
      ).toMatchObject({
        reminders: { quietStart: 20, morningHour: 10, quietEnd: 8 },
      });
    });
  },
);
