import type { ContextProvider } from "@/core/contracts";
import { formatDue } from "./format";
import { tasksService } from "./service";

/** 레이첼 프롬프트에 넣는 "지금 신경 쓸 카드" — 지연 + 오늘 마감 ≤ 10 */
export const tasksContextProvider: ContextProvider = {
  id: "tasks.due",
  budgetTokens: 600,
  build: async (ctx) => {
    const svc = tasksService(ctx);
    const [overdue, today] = await Promise.all([
      svc.listCards({ due: "overdue", limit: 10 }),
      svc.listCards({ due: "today", limit: 10 }),
    ]);
    if (overdue.length === 0 && today.length === 0) return null;
    const line = (c: (typeof overdue)[number]) =>
      `- ${c.title} (id ${c.id.slice(0, 8)}…, ${formatDue(c, ctx.now, ctx.timezone)?.text ?? ""}, P${c.priority})`;
    return [
      "[할 일]",
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
