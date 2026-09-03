import { z } from "zod";

export const NOTIFICATION_KINDS = [
  "meeting_ready",
  "daily_brief",
  "weekly_review",
  "due_soon",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export const KIND_LABEL: Record<NotificationKind, string> = {
  meeting_ready: "회의 정리 완료",
  daily_brief: "아침 브리핑",
  weekly_review: "주간 리뷰",
  due_soon: "마감 임박",
};

export const pushPayloadSchema = z.object({
  kind: z.enum(NOTIFICATION_KINDS),
  title: z.string().max(80),
  body: z.string().max(200),
  url: z.string().default("/today"),
  tag: z.string().optional(),
});
export type PushPayload = z.infer<typeof pushPayloadSchema>;

export const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
  userAgent: z.string().optional(),
});
