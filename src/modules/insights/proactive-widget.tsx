import type { DashboardWidget } from "@/core/contracts";
import { proactiveService, type SuggestionRow } from "./proactive";
import { ProactiveCards } from "./proactive-card";
import { scheduleProactiveCheck } from "./proactive-jobs";
export const proactiveWidget: DashboardWidget<{
  items: SuggestionRow[];
  notices: string[];
}> = {
  id: "insights.proactive",
  title: "확인할 제안",
  surface: "today",
  size: "lg",
  placement: "top",
  order: -5,
  load: async (ctx) => {
    const svc = proactiveService(ctx);
    const listed = await svc.list();
    if (listed.initiative === "on_request") return { items: [], notices: [] };
    const refreshed = await svc.refresh();
    await scheduleProactiveCheck(ctx);
    return { items: (await svc.list()).items, notices: refreshed.notices };
  },
  Component: ({ data }) => <ProactiveCards {...data} />,
};
