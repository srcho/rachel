import type { ContextProvider } from "@/core/contracts";
import { dayBounds, localYmd } from "@/core/utils/date";
import { eventService } from "./events";
import { addDays } from "./format";
import {
  expandOccurrences,
  type Occurrence,
  occurrenceLabel,
} from "./occurrences";
import type { EventRow } from "./repository";

/** 오늘·내일 일정 ≤ 10 */
export const calendarContextProvider: ContextProvider = {
  id: "calendar.upcoming",
  budgetTokens: 800,
  build: async (ctx) => {
    const today = dayBounds(ctx.now, ctx.timezone);
    const tomorrow = dayBounds(ctx.now, ctx.timezone, 1);
    const svc = eventService(ctx);
    const page = await svc.listEventsPage({
      from: today.start,
      to: tomorrow.end,
      limit: 20,
    });
    const { events } = page;
    const names = page.calendars
      .filter((c) => c.writable)
      .map((c) => `${c.name}${c.primary ? "(기본)" : ""}`)
      .join(", ");
    const status = `[일정] OAuth=${page.oauthStatus}; 선택 ${page.selectedCount}개; 시간대=${ctx.timezone}; 쓰기 가능=${names || "없음"}`;
    const coverage = page.coverage
      .map(
        (c) =>
          `${c.calendarId}: ${c.freshness}, 수집=${c.from ?? "미확인"}~${c.to ?? "미확인"}, 조회기간포함=${c.rangeCovered}`,
      )
      .join("; ");
    const completeness = `${page.complete ? "조회 완결" : "미완결: 일정 없음/가용 시간을 단정하지 말 것"}${page.hasMore ? "; 다음 페이지 있음(calendar.listEvents로 이어서 확인)" : ""}`;
    const header = `${status}\n${completeness}${coverage ? `\n${coverage}` : ""}`;
    if (events.length === 0)
      return `${header}\n${page.complete ? "오늘·내일 일정 없음" : "현재 로컬 조회 결과 0개"}`;
    const todayYmd = localYmd(ctx.now, ctx.timezone);
    const byDay = expandOccurrences(
      events,
      todayYmd,
      addDays(todayYmd, 2),
      ctx.timezone,
    );
    // 이벤트당 한 줄(오늘·내일 걸치면 "오늘~내일"), 10줄 상한은 이벤트 기준
    const seen = new Set<string>();
    const lines: Array<{ day: string; o: Occurrence<EventRow> }> = [];
    for (const [day, ymd] of [
      ["오늘", todayYmd],
      ["내일", addDays(todayYmd, 1)],
    ] as const) {
      for (const o of byDay.get(ymd) ?? []) {
        if (seen.has(o.event.id)) continue;
        seen.add(o.event.id);
        lines.push({ day: day === "오늘" && !o.isEnd ? "오늘~내일" : day, o });
      }
    }
    if (lines.length === 0) return `${header}\n현재 표시 가능한 일정 0개`;
    return `${header}${lines.length > 10 ? "\n일부 일정만 표시(최대 10개)" : ""}\n${lines
      .slice(0, 10)
      .map(
        ({ day, o }) =>
          `- ${day} ${occurrenceLabel(o, ctx.timezone)} ${o.event.title}${o.event.location ? ` @${o.event.location}` : ""} (id ${o.event.id.slice(0, 8)}…)`,
      )
      .join("\n")}`;
  },
};
