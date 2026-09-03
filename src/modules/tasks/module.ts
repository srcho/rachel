import type { RachelModule } from "@/core/contracts";

/** tasks 모듈. 도구·위젯·인덱서는 S1.3 에서 채운다. */
export const tasksModule: RachelModule = {
  manifest: {
    id: "tasks",
    name: "할 일",
    icon: "square-kanban",
    nav: { href: "/tasks", order: 20, mobileTab: true },
    schemaVersion: 3,
  },
};
