import type { RachelModule } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { agentModule } from "./agent/module";
import { calendarModule } from "./calendar/module";
import { insightsModule } from "./insights/module";
import { memoryModule } from "./memory/module";
import { tasksModule } from "./tasks/module";

/** 기능 추가 = 여기에 한 줄. 순서는 nav order 와 무관. */
export const modules: RachelModule[] = [
  tasksModule,
  calendarModule,
  agentModule,
  memoryModule,
];

export const registry = createRegistry(() => modules);
