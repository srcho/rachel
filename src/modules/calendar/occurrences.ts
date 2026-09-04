import { localYmd } from "@/core/utils/date";
import { addDays, fmtTime } from "./format";
import type { EventRow } from "./repository";

/** 이벤트가 어떤 날에 "보이는" 조각. 여러 날에 걸치면 날마다 하나씩. */
export interface Occurrence<E extends EventLike = EventLike> {
  event: E;
  ymd: string;
  /** 이 조각이 이벤트의 첫날/마지막날인지 */
  isStart: boolean;
  isEnd: boolean;
  /** 1부터. 하루짜리는 1/1 */
  dayIndex: number;
  dayCount: number;
}
export type EventLike = Pick<
  EventRow,
  "id" | "title" | "start_at" | "end_at" | "all_day"
>;

/** 이벤트가 덮는 로컬 날짜 범위 [firstYmd, lastYmd]. end 는 배타적이라 1ms 앞을 본다. */
export function eventDays(
  e: Pick<EventRow, "start_at" | "end_at">,
  tz: string,
): { first: string; last: string } {
  const start = new Date(e.start_at);
  const endMs = Math.max(new Date(e.end_at).getTime() - 1, start.getTime());
  return { first: localYmd(start, tz), last: localYmd(new Date(endMs), tz) };
}

/**
 * [fromYmd, toYmd) 안의 날짜별로 이벤트 조각을 배열한다.
 * 날마다 정렬: 여러 날 짜리·종일이 먼저, 그다음 시작 시각.
 */
export function expandOccurrences<E extends EventLike>(
  events: E[],
  fromYmd: string,
  toYmd: string,
  tz: string,
): Map<string, Occurrence<E>[]> {
  const byDay = new Map<string, Occurrence<E>[]>();
  for (const e of events) {
    const { first, last } = eventDays(e, tz);
    const count = diffDays(first, last) + 1;
    // 창 밖은 걷지 않는다(오래전에 시작한 장기 일정도 창 길이만큼만 비용)
    let ymd = first > fromYmd ? first : fromYmd;
    let i = diffDays(first, ymd);
    while (ymd <= last && ymd < toYmd) {
      const list = byDay.get(ymd) ?? [];
      list.push({
        event: e,
        ymd,
        isStart: ymd === first,
        isEnd: ymd === last,
        dayIndex: i + 1,
        dayCount: count,
      });
      byDay.set(ymd, list);
      ymd = addDays(ymd, 1);
      i++;
    }
  }
  for (const list of byDay.values()) list.sort(compareOccurrence);
  return byDay;
}

/** 종일 → 전날부터 이어지는 조각 → 그 날 시작하는 시각 일정(시작 시각순) */
function compareOccurrence(a: Occurrence, b: Occurrence): number {
  const rank = (o: Occurrence) =>
    o.event.all_day ? 0 : o.dayCount > 1 && !o.isStart ? 1 : 2;
  const d = rank(a) - rank(b);
  if (d !== 0) return d;
  return a.event.start_at.localeCompare(b.event.start_at);
}

function diffDays(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  );
}

/**
 * 조각의 시간 라벨.
 * 하루짜리 시각 일정 "10:00–11:00", 종일 "종일",
 * 여러 날: 첫날 "10:00 →", 중간 "계속", 마지막 "→ 11:00". 종일 여러 날은 "종일 · 2/3일".
 */
export function occurrenceLabel(o: Occurrence, tz: string): string {
  const { event: e } = o;
  if (o.dayCount === 1)
    return e.all_day
      ? "종일"
      : `${fmtTime(e.start_at, tz)}–${fmtTime(e.end_at, tz)}`;
  if (e.all_day) return `종일 · ${o.dayIndex}/${o.dayCount}일`;
  if (o.isStart) return `${fmtTime(e.start_at, tz)} →`;
  if (o.isEnd) return `→ ${fmtTime(e.end_at, tz)}`;
  return `계속 · ${o.dayIndex}/${o.dayCount}일`;
}

/** 목록 화면(주·월)용 짧은 라벨: 시작 시각만 */
export function occurrenceShortLabel(o: Occurrence, tz: string): string {
  const { event: e } = o;
  if (e.all_day) return o.dayCount > 1 ? `${o.dayIndex}/${o.dayCount}` : "";
  if (o.isStart) return fmtTime(e.start_at, tz);
  if (o.isEnd) return `→${fmtTime(e.end_at, tz)}`;
  return "계속";
}
