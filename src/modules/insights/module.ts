import type { RachelModule } from "@/core/contracts";
import { briefJob, weeklyJob } from "./jobs";
import { insightsTools } from "./tools";
import { briefWidget } from "./widgets";
import {
  calendarLoadWidget,
  captureConversionWidget,
  costWidget,
  meetingsHoursWidget,
  patternsWidget,
  throughputWidget,
} from "./widgets-metrics";

/** insights 모듈: 브리핑·지표 위젯·AI 비용·주간 리뷰 */
export const insightsModule: RachelModule = {
  manifest: {
    id: "insights",
    name: "인사이트",
    icon: "chart-no-axes-combined",
    nav: { href: "/insights", order: 50, mobileTab: false },
    schemaVersion: 7,
  },
  tools: insightsTools,
  widgets: [
    briefWidget,
    patternsWidget,
    throughputWidget,
    meetingsHoursWidget,
    calendarLoadWidget,
    captureConversionWidget,
    costWidget,
  ],
  jobs: { brief: briefJob, weekly: weeklyJob },
  commands: [
    {
      id: "insights.open",
      label: "인사이트 보기",
      keywords: ["dashboard", "지표"],
      href: "/insights",
    },
  ],
};
