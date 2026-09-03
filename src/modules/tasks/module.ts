import type { RachelModule } from "@/core/contracts";
import { tasksContextProvider } from "./context";
import {
  gtaskChangedHandler,
  gtaskCreatedHandler,
  gtasksEnabledHandler,
} from "./events";
import { cardsIndexer } from "./indexer";
import { tasksTools } from "./tools";
import { dueTodayWidget } from "./widgets";

export const tasksModule: RachelModule = {
  manifest: {
    id: "tasks",
    name: "할 일",
    icon: "square-kanban",
    nav: { href: "/tasks", order: 20, mobileTab: true },
    schemaVersion: 15,
  },
  indexers: [cardsIndexer],
  eventHandlers: [
    gtaskChangedHandler,
    gtaskCreatedHandler,
    gtasksEnabledHandler,
  ],
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
