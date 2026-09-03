/** 타임존 유틸. date-fns-tz 없이 Intl 만 쓴다(번들 최소화). */

function tzOffsetMs(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** 타임존 기준 날짜 문자열 YYYY-MM-DD */
export function localYmd(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** 타임존 기준 그 날의 [자정, 다음 자정) 을 UTC ISO 로. offsetDays 로 며칠 뒤 날짜. */
export function dayBounds(
  now: Date,
  timeZone: string,
  offsetDays = 0,
): { start: string; end: string } {
  const ymd = localYmd(
    new Date(now.getTime() + offsetDays * 86_400_000),
    timeZone,
  );
  const guess = Date.parse(`${ymd}T00:00:00Z`);
  const start = guess - tzOffsetMs(timeZone, new Date(guess));
  const nextYmd = localYmd(new Date(start + 36 * 3_600_000), timeZone);
  const nextGuess = Date.parse(`${nextYmd}T00:00:00Z`);
  const end = nextGuess - tzOffsetMs(timeZone, new Date(nextGuess));
  return {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
  };
}
