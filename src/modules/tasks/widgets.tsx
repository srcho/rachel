import type { DashboardWidget } from "@/core/contracts";
import { localYmd } from "@/core/utils/date";
import { addDays } from "../calendar/format";
import type { CardRow } from "./repository";
import { tasksService } from "./service";
import { TodayTasks } from "./ui/TodayTasks";

interface DueData {
  overdue: CardRow[];
  due: CardRow[];
  planned: CardRow[];
  suggestions: CardRow[];
  today: string;
  tomorrow: string;
}
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
    const today = localYmd(ctx.now, ctx.timezone);
    const [overdue, due, planned, candidates] = await Promise.all([
      svc.listCards({ due: "overdue", limit: 200 }),
      svc.listCards({ due: "today", limit: 200 }),
      svc.listCards({ planDate: today, limit: 200 }),
      svc.listCards({ limit: 200 }),
    ]);
    const suggestions = candidates
      .filter((c) => !c.plan_date || c.plan_date <= today)
      .sort(
        (a, b) =>
          a.priority - b.priority ||
          (a.due_at ?? "z").localeCompare(b.due_at ?? "z"),
      )
      .slice(0, 3);
    return {
      overdue,
      due,
      planned,
      suggestions,
      today,
      tomorrow: addDays(today, 1),
    };
  },
  Component: ({ data }) => <TodayTasks {...data} />,
};

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex h-full min-h-10 items-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
