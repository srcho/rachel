import type { EventRow } from "./repository";

export const TZ = "Asia/Seoul";

export function fmtTime(iso: string, tz = TZ): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
export function fmtDayHeader(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
}
export function eventTimeLabel(
  e: Pick<EventRow, "start_at" | "end_at" | "all_day">,
  tz = TZ,
): string {
  if (e.all_day) return "종일";
  return `${fmtTime(e.start_at, tz)}–${fmtTime(e.end_at, tz)}`;
}
/** YYYY-MM-DD 를 n일 이동 */
export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function startOfWeek(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 월요일 시작
  return addDays(ymd, -dow);
}
export function startOfMonth(ymd: string): string {
  return `${ymd.slice(0, 8)}01`;
}
export function addMonths(ymd: string, n: number): string {
  const [y, m] = ymd.split("-").map(Number);
  const d = new Date(
    Date.UTC(
      (y ?? 2026) + Math.floor(((m ?? 1) - 1 + n) / 12),
      ((((m ?? 1) - 1 + n) % 12) + 12) % 12,
      1,
    ),
  );
  return d.toISOString().slice(0, 10);
}
