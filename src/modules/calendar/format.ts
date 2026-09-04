export const TZ = "Asia/Seoul";

const timeFormatters = new Map<string, Intl.DateTimeFormat>();
export function fmtTime(iso: string, tz = TZ): string {
  let f = timeFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("ko-KR", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    timeFormatters.set(tz, f);
  }
  return f.format(new Date(iso));
}
const dayHeaderFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  weekday: "short",
});
export function fmtDayHeader(ymd: string): string {
  return dayHeaderFormatter.format(new Date(`${ymd}T00:00:00`));
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
