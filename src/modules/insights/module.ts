import type { RachelModule } from "@/core/contracts";
import { briefJob } from "./jobs";
import { insightsTools } from "./tools";
import { briefWidget } from "./widgets";

/** insights 모듈: 브리핑(S2.5) → 지표·대시보드·주간 리뷰(P5) */
export const insightsModule: RachelModule = {
  manifest: {
    id: "insights",
    name: "인사이트",
    icon: "chart-no-axes-combined",
    nav: { href: "/insights", order: 50, mobileTab: false },
    schemaVersion: 7,
  },
  tools: insightsTools,
  widgets: [briefWidget],
  jobs: { brief: briefJob },
};
