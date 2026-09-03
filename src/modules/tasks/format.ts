import type { CardRow } from "./repository";

export const PRIORITY_LABEL: Record<number, string> = {
  0: "P0 긴급",
  1: "P1 높음",
  2: "P2 보통",
  3: "P3 낮음",
};
export const PRIORITY_DOT: Record<number, string> = {
  0: "bg-red-500",
  1: "bg-amber-500",
  2: "bg-muted-foreground/40",
  3: "bg-muted-foreground/20",
};

/** 마감 상대 표기: 오늘 15:00 · 내일 · D-3 · 9/12 · 2일 지남 */
export function formatDue(
  card: Pick<CardRow, "due_at" | "due_has_time">,
  now = new Date(),
  timeZone = "Asia/Seoul",
): { text: string; tone: "overdue" | "today" | "soon" | "normal" } | null {
  if (!card.due_at) return null;
  const due = new Date(card.due_at);
  const ymd = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  const todayYmd = ymd(now);
  const dueYmd = ymd(due);
  const dayDiff = Math.round(
    (Date.parse(`${dueYmd}T00:00:00Z`) - Date.parse(`${todayYmd}T00:00:00Z`)) /
      86_400_000,
  );
  const time = card.due_has_time
    ? ` ${new Intl.DateTimeFormat("ko-KR", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(due)}`
    : "";
  if (dayDiff < 0) return { text: `${-dayDiff}일 지남`, tone: "overdue" };
  if (dayDiff === 0) return { text: `오늘${time}`, tone: "today" };
  if (dayDiff === 1) return { text: `내일${time}`, tone: "soon" };
  if (dayDiff <= 7) return { text: `D-${dayDiff}`, tone: "soon" };
  return {
    text: new Intl.DateTimeFormat("ko-KR", {
      timeZone,
      month: "numeric",
      day: "numeric",
    }).format(due),
    tone: "normal",
  };
}

export const DUE_TONE: Record<
  NonNullable<ReturnType<typeof formatDue>>["tone"],
  string
> = {
  overdue: "text-red-600 dark:text-red-400",
  today: "text-amber-600 dark:text-amber-400",
  soon: "text-foreground",
  normal: "text-muted-foreground",
};
