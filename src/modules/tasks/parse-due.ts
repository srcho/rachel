import * as chrono from "chrono-node";

export interface ParsedDue {
  dueAt: string;
  hasTime: boolean;
  /** 마감 표현을 제거한 제목 */
  title: string;
  matched: string;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 타임존 기준 날짜/시간 → UTC Date */
function zonedToUtc(
  y: number,
  m: number,
  d: number,
  h: number,
  min: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(guess));
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
  );
  return new Date(guess - (asUtc - guess));
}

function localParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    get("weekday"),
  );
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    wd,
  };
}

const TIME_RE =
  /(오전|오후|아침|저녁|밤)?\s*(\d{1,2})(?::(\d{2})|시\s*(반|\d{1,2}분)?)\s*(오전|오후)?/;

/** 한국어 시간 표현 → {h, min}. "3시", "오후 3시", "15:30", "3시 반" */
function parseTime(
  text: string,
): { h: number; min: number; matched: string } | null {
  const m = TIME_RE.exec(text);
  if (!m) return null;
  let h = Number(m[2]);
  const min = m[3]
    ? Number(m[3])
    : m[4] === "반"
      ? 30
      : m[4]
        ? Number(m[4].replace("분", ""))
        : 0;
  const ampm = m[1] ?? m[5];
  if ((ampm === "오후" || ampm === "저녁" || ampm === "밤") && h < 12) h += 12;
  if (ampm === "오전" && h === 12) h = 0;
  if (!ampm && h >= 1 && h <= 6 && !m[3]) h += 12; // "3시" 는 오후로 본다(업무 시간 가정)
  if (h > 23) return null;
  return { h, min, matched: m[0] };
}

interface DateHit {
  days?: number;
  month?: number;
  day?: number;
  matched: string;
}
type Now = { y: number; m: number; d: number; wd: number };

const DATE_RULES: Array<
  [RegExp, (m: RegExpExecArray, now: Now) => Omit<DateHit, "matched">]
> = [
  [/오늘/, () => ({ days: 0 })],
  [/내일|명일/, () => ({ days: 1 })],
  [/모레/, () => ({ days: 2 })],
  [/글피/, () => ({ days: 3 })],
  [/(\d+)\s*일\s*(후|뒤)/, (m) => ({ days: Number(m[1]) })],
  [/(\d+)\s*주\s*(후|뒤)/, (m) => ({ days: Number(m[1]) * 7 })],
  [
    /(다음\s*주|담주|이번\s*주|차주)\s*([일월화수목금토])(요일)?/,
    (m, now) => {
      const target = WEEKDAYS.indexOf(m[2] ?? "");
      const nextWeek = /다음|담|차주/.test(m[1] ?? "");
      // 이번 주: 같은 주(월~일)의 해당 요일. 다음 주: 다음 월요일이 있는 주.
      const mondayOffset = now.wd === 0 ? -6 : 1 - now.wd; // 이번 주 월요일까지의 일수
      const targetOffset = target === 0 ? 6 : target - 1; // 월요일 기준 요일 오프셋
      return { days: mondayOffset + targetOffset + (nextWeek ? 7 : 0) };
    },
  ],
  [
    /(다음\s*주|담주|차주)/,
    (_m, now) => ({ days: (now.wd === 0 ? -6 : 1 - now.wd) + 7 }),
  ],
  [
    /(\d{1,2})\s*월\s*(\d{1,2})\s*일/,
    (m) => ({ month: Number(m[1]), day: Number(m[2]) }),
  ],
  [
    /(\d{1,2})\s*\/\s*(\d{1,2})/,
    (m) => ({ month: Number(m[1]), day: Number(m[2]) }),
  ],
  [
    /(?:^|\s)(\d{1,2})\s*일(?:까지|에)?(?=\s|$)/,
    (m) => ({ day: Number(m[1]) }),
  ],
  [
    /([일월화수목금토])요일/,
    (m, now) => {
      const target = WEEKDAYS.indexOf(m[1] ?? "");
      let days = (target - now.wd + 7) % 7;
      if (days === 0) days = 7;
      return { days };
    },
  ],
];

/** 한국어 날짜 표현 → 오늘로부터의 일수 또는 절대 (m, d). */
function parseDate(text: string, now: Now): DateHit | null {
  for (const [re, resolve] of DATE_RULES) {
    const m = re.exec(text);
    if (m) return { ...resolve(m, now), matched: m[0].trim() };
  }
  return null;
}

/**
 * "내일 3시 PRD 검토", "다음주 월 보고서", "9/12까지 정산" 같은 입력에서 마감을 뽑는다.
 * 한국어 규칙 우선, 없으면 chrono(영어). 날짜만 있으면 그날 23:59 로 둔다.
 */
export function parseDueFromTitle(
  text: string,
  now = new Date(),
  timeZone = "Asia/Seoul",
): ParsedDue | null {
  const lp = localParts(now, timeZone);
  const date = parseDate(text, lp);
  const time = parseTime(date ? text.replace(date.matched, " ") : text);
  if (!date && !time) {
    const r = chrono.parse(text, now, { forwardDate: true })[0];
    if (!r) return null;
    const hasTime = r.start.isCertain("hour");
    const d = r.start.date();
    if (!hasTime) d.setHours(23, 59, 0, 0);
    return {
      dueAt: d.toISOString(),
      hasTime,
      title: cleanup(text, [r.text]),
      matched: r.text,
    };
  }
  let y = lp.y;
  let mo = lp.m;
  let d = lp.d;
  if (date?.days !== undefined) {
    const base = zonedToUtc(lp.y, lp.m, lp.d, 12, 0, timeZone);
    const target = new Date(base.getTime() + date.days * 86_400_000);
    const tp = localParts(target, timeZone);
    y = tp.y;
    mo = tp.m;
    d = tp.d;
  } else if (date?.day !== undefined) {
    mo = date.month ?? lp.m;
    d = date.day;
    if (date.month === undefined && d < lp.d) mo += 1; // 이미 지난 날짜면 다음 달
    if (date.month !== undefined && (mo < lp.m || (mo === lp.m && d < lp.d)))
      y += 1;
    if (mo > 12) {
      mo = 1;
      y += 1;
    }
  }
  const hasTime = time !== null;
  const due = zonedToUtc(
    y,
    mo,
    d,
    hasTime ? time.h : 23,
    hasTime ? time.min : 59,
    timeZone,
  );
  const matched = [date?.matched, time?.matched].filter((s): s is string =>
    Boolean(s),
  );
  return {
    dueAt: due.toISOString(),
    hasTime,
    title: cleanup(text, matched),
    matched: matched.join(" "),
  };
}

function cleanup(text: string, matched: string[]): string {
  let t = text;
  for (const m of matched) t = t.replace(m, " ");
  t = t
    .replace(/\s*(까지|에)\s/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return t || text;
}
