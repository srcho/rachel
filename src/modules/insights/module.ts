import type { RachelModule } from "@/core/contracts";
import { briefJob, weeklyJob } from "./jobs";
import { proactiveWidget } from "./proactive-widget";
import { insightsTools } from "./tools";
import { briefWidget, dayCloseWidget } from "./widgets";
import {
  captureConversionWidget,
  cycleWidget,
  meetingShareWidget,
  overdueWidget,
  patternsWidget,
  slotWidget,
  throughputWidget,
} from "./widgets-metrics";

/** insights 모듈: 브리핑·지표 위젯(lieflat 스타일)·주간 리뷰. AI 비용은 설정 화면 */
export const insightsModule: RachelModule = {
  manifest: {
    id: "insights",
    name: "리뷰",
    icon: "chart-no-axes-combined",
    nav: { href: "/insights", order: 50, mobileTab: false },
    schemaVersion: 7,
  },
  tools: insightsTools,
  widgets: [
    proactiveWidget,
    briefWidget,
    dayCloseWidget,
    patternsWidget,
    throughputWidget,
    cycleWidget,
    slotWidget,
    meetingShareWidget,
    captureConversionWidget,
    overdueWidget,
  ],
  jobs: { brief: briefJob, weekly: weeklyJob },
  commands: [
    {
      id: "insights.open",
      label: "리뷰 보기",
      keywords: ["dashboard", "지표"],
      href: "/insights",
    },
  ],
};
