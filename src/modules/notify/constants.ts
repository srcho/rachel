// zod 없이 클라이언트에서도 쓰는 상수 (schema.ts 는 zod 를 끌어온다)
export const NOTIFICATION_KINDS = [
  "meeting_ready",
  "daily_brief",
  "weekly_review",
  "due_soon",
  "event_soon",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export const KIND_LABEL: Record<NotificationKind, string> = {
  meeting_ready: "회의 정리 완료",
  daily_brief: "아침 브리핑",
  weekly_review: "주간 리뷰",
  due_soon: "할 일 마감·아침 묶음",
  event_soon: "일정 시작 전",
};
