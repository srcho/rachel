import type { ContextProvider } from "@/core/contracts";
import { localYmd } from "@/core/utils/date";
import { formatDue } from "./format";
import { tasksService } from "./service";

/** 오늘 계획과 마감을 분리하고 각 범주의 조회 범위를 명시한다. */
export const tasksContextProvider: ContextProvider = {
  id: "tasks.due",
  budgetTokens: 600,
  build: async (ctx) => {
    const svc = tasksService(ctx);
    const [overdue, today, planned] = await Promise.all([
      svc.listCards({ due: "overdue", limit: 10 }),
      svc.listCards({ due: "today", limit: 10 }),
      svc.listCards({ planDate: localYmd(ctx.now, ctx.timezone), limit: 10 }),
    ]);
    if (overdue.length === 0 && today.length === 0 && planned.length === 0)
      return null;
    const line = (c: (typeof overdue)[number]) =>
      `- ${c.title} (id ${c.id}, ${formatDue(c, ctx.now, ctx.timezone)?.text ?? "마감 없음"}, 계획 ${c.plan_date ?? "미정"}, 시간 블록 ${c.calendar_event_id ?? "없음"}, P${c.priority})`;
    return [
      "[할 일 — 각 범주 최대 10건, 전체 목록 아님. 계획 날짜와 마감은 별개]",
      planned.length
        ? `오늘 계획 ${planned.length}건:\n${planned.map(line).join("\n")}`
        : null,
      overdue.length
        ? `지연 ${overdue.length}건:\n${overdue.slice(0, 10).map(line).join("\n")}`
        : null,
      today.length
        ? `오늘 마감 ${today.length}건:\n${today.slice(0, 10).map(line).join("\n")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");
  },
};
