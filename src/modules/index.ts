import type { RachelModule } from "@/core/contracts";
import { setRegistry } from "@/core/registry/current";
import { createRegistry } from "@/core/registry/registry";
import { agentModule } from "./agent/module";
import { calendarModule } from "./calendar/module";
import { captureModule } from "./capture/module";
import { insightsModule } from "./insights/module";
import { meetingsModule } from "./meetings/module";
import { memoryModule } from "./memory/module";
import { notifyModule } from "./notify/module";
import { systemModule } from "./system/module";
import { tasksModule } from "./tasks/module";

/** 기능 추가 = 여기에 한 줄. 순서는 nav order 와 무관. */
export const modules: RachelModule[] = [
  tasksModule,
  calendarModule,
  agentModule,
  memoryModule,
  meetingsModule,
  insightsModule,
  captureModule,
  notifyModule,
  systemModule,
];

export const registry = createRegistry(() => modules);
setRegistry(registry);
