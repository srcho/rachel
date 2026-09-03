import type { RachelModule } from "@/core/contracts";
import { tasksContextProvider } from "./context";
import { cardsIndexer } from "./indexer";
import { tasksTools } from "./tools";
import { dueTodayWidget } from "./widgets";

export const tasksModule: RachelModule = {
  manifest: {
    id: "tasks",
    name: "할 일",
    icon: "square-kanban",
    nav: { href: "/tasks", order: 20, mobileTab: true },
    schemaVersion: 3,
  },
  indexers: [cardsIndexer],
  tools: tasksTools,
  widgets: [dueTodayWidget],
  contextProviders: [tasksContextProvider],
  commands: [
    {
      id: "tasks.open",
      label: "할 일 보드 열기",
      keywords: ["칸반", "tasks"],
      href: "/tasks",
    },
  ],
};
