import type { DashboardWidget } from "@/core/contracts";
import { cn } from "@/lib/utils";
import { DUE_TONE, formatDue, PRIORITY_DOT } from "./format";
import type { CardRow } from "./repository";
import { tasksService } from "./service";

interface DueData {
  overdue: CardRow[];
  today: CardRow[];
  boardId: string | null;
}

function Row({ card }: { card: CardRow }) {
  const due = formatDue(card);
  return (
    <li className="flex items-center gap-2 py-1.5 text-sm">
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          PRIORITY_DOT[card.priority] ?? PRIORITY_DOT[2],
        )}
      />
      <span className="min-w-0 flex-1 truncate">{card.title}</span>
      {due && (
        <span
          className={cn("shrink-0 text-xs tabular-nums", DUE_TONE[due.tone])}
        >
          {due.text}
        </span>
      )}
    </li>
  );
}

/** 오늘 마감 + 지연 카드. 목적: 오늘 반드시 건드릴 것만 한눈에. */
export const dueTodayWidget: DashboardWidget<DueData> = {
  id: "tasks.due",
  title: "오늘 할 일",
  surface: "today",
  size: "md",
  rows: 2,
  href: "/tasks",
  order: 20,
  load: async (ctx) => {
    const svc = tasksService(ctx);
    const [overdue, today, boards] = await Promise.all([
      svc.listCards({ due: "overdue", limit: 20 }),
      svc.listCards({ due: "today", limit: 20 }),
      svc.listBoards(),
    ]);
    return {
      overdue,
      today,
      boardId: boards.find((b) => b.is_default)?.id ?? boards[0]?.id ?? null,
    };
  },
  Component: ({ data }) =>
    data.overdue.length === 0 && data.today.length === 0 ? (
      <Empty>오늘 마감인 카드가 없어요.</Empty>
    ) : (
      <ul className="divide-y">
        {data.overdue.map((c) => (
          <Row key={c.id} card={c} />
        ))}
        {data.today.map((c) => (
          <Row key={c.id} card={c} />
        ))}
      </ul>
    ),
};

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex h-full min-h-16 items-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
