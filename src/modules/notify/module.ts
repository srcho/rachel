import type { EventHandler, RachelModule } from "@/core/contracts";
import { sendJob } from "./jobs";
import { reminderJob, scheduleReminders } from "./reminders";
import type { PushPayload } from "./schema";
import { NotifySettings } from "./ui/NotifySettings";

const enqueuePush =
  (payload: PushPayload): EventHandler["handle"] =>
  async (_e, ctx) => {
    await ctx.enqueue({
      type: "notify.send",
      payload,
      dedupeKey: `notify:${payload.kind}:${payload.tag ?? ""}:${Date.now()}`,
    });
  };

/** notify 모듈: 이벤트 → 푸시. 알림 종류별 on/off 는 profiles.settings.notifications */
export const notifyModule: RachelModule = {
  manifest: { id: "notify", name: "알림", icon: "bell", schemaVersion: 13 },
  jobs: { send: sendJob, reminder: reminderJob },
  settings: {
    id: "notify",
    title: "알림",
    order: 30,
    Component: NotifySettings,
  },
  eventHandlers: [
    ...[
      "task.created",
      "task.updated",
      "task.reopened",
      "calendar_event.created",
      "calendar_event.updated",
      "calendar.synced",
    ].map((on) => ({
      on,
      handle: async (
        _e: unknown,
        ctx: import("@/core/contracts").ServiceContext,
      ) => {
        await scheduleReminders(ctx);
      },
    })),
    {
      on: "meeting.summarized",
      handle: async (e, ctx) => {
        const p = e.payload as {
          pass?: string;
          empty?: boolean;
          actionItems?: number;
        };
        if (p.empty) return;
        const body =
          p.pass === "final"
            ? `화자 분리까지 끝났어요. 후속 할 일 ${p.actionItems ?? 0}개`
            : `요약이 준비됐어요. 후속 할 일 ${p.actionItems ?? 0}개`;
        await enqueuePush({
          kind: "meeting_ready",
          title: "회의 정리 완료",
          body,
          url: `/meetings/${e.entity.id}`,
          tag: `meeting:${e.entity.id}:${p.pass}`,
        })(e, ctx);
      },
    },
    {
      on: "insight.weekly_review",
      handle: async (e, ctx) =>
        enqueuePush({
          kind: "weekly_review",
          title: "이번 주 리뷰가 도착했어요",
          body: "레이첼이 한 주를 정리했어요.",
          url: "/insights",
          tag: "weekly",
        })(e, ctx),
    },
    {
      on: "insight.daily_brief",
      handle: async (e, ctx) => {
        const p = e.payload as { scheduled?: boolean; tldr?: string };
        if (!p.scheduled) return; // 크론이 만든 브리핑만 푸시(사용자가 화면에서 만든 건 제외)
        await enqueuePush({
          kind: "daily_brief",
          title: "오늘의 브리핑",
          body: (p.tldr ?? "레이첼의 브리핑을 확인해 보세요.").slice(0, 180),
          url: "/today",
          tag: "brief",
        })(e, ctx);
      },
    },
  ],
};
