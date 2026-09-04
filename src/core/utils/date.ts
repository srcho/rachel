/** 타임존 유틸. date-fns-tz 없이 Intl 만 쓴다(번들 최소화). */

export function tzOffsetMs(timeZone: string, date: Date): number {
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
const ymdFormatters = new Map<string, Intl.DateTimeFormat>();
/** 타임존별 Intl 포매터 캐시 — 생성 비용이 포맷 비용의 50배라 렌더 경로에서 호출마다 만들지 않는다 */
export function ymdFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = ymdFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    ymdFormatters.set(timeZone, f);
  }
  return f;
}
export function localYmd(date: Date, timeZone: string): string {
  return ymdFormatter(timeZone).format(date);
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

/** 이번 달 1일 00:00 UTC(원장 뷰 `v_llm_usage_monthly` 의 month 키와 같은 기준) */
export function monthStartIso(now = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
}

export const DEFAULT_TZ = "Asia/Seoul";
const dtFormatters = new Map<string, Intl.DateTimeFormat>();
/**
 * 서버·클라이언트가 같은 결과를 내도록 타임존을 항상 명시한 날짜/시각 표기(캐시).
 * kind: "date" 9. 4. · "datetime" 9. 4. 14:00 · "short" 9월 4일 14:00
 */
export function fmtDateTime(
  iso: string | Date,
  timeZone: string,
  kind: "date" | "datetime" | "short" = "datetime",
): string {
  const key = `${timeZone}|${kind}`;
  let f = dtFormatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("ko-KR", {
      timeZone,
      ...(kind === "date"
        ? { year: "numeric", month: "numeric", day: "numeric" }
        : kind === "short"
          ? {
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }
          : {
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }),
    });
    dtFormatters.set(key, f);
  }
  return f.format(typeof iso === "string" ? new Date(iso) : iso);
}
