import Link from "next/link";
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
    <li className="flex items-center gap-2 py-1 text-sm">
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

export const dueTodayWidget: DashboardWidget<DueData> = {
  id: "tasks.due",
  title: "오늘 할 일",
  surface: "today",
  size: "md",
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
  Component: ({ data }) => (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-medium">오늘 할 일</h3>
        {data.boardId && (
          <Link
            href={`/tasks/${data.boardId}`}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            보드 열기
          </Link>
        )}
      </div>
      {data.overdue.length === 0 && data.today.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          오늘 마감인 카드가 없어요.
        </p>
      ) : (
        <ul className="divide-y">
          {data.overdue.map((c) => (
            <Row key={c.id} card={c} />
          ))}
          {data.today.map((c) => (
            <Row key={c.id} card={c} />
          ))}
        </ul>
      )}
    </div>
  ),
};
