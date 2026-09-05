import type { RachelModule } from "@/core/contracts";
import { captureIndexer } from "./indexer";
import { triageJob } from "./jobs";
import { captureTools } from "./tools";
import { captureWidget } from "./widgets";

export const captureModule: RachelModule = {
  manifest: {
    id: "capture",
    name: "수집함",
    icon: "inbox",
    nav: { href: "/capture", order: 45, mobileTab: false },
    schemaVersion: 11,
  },
  tools: captureTools,
  indexers: [captureIndexer],
  widgets: [captureWidget],
  jobs: { triage: triageJob },
  commands: [
    {
      id: "capture.open",
      label: "수집함 열기",
      keywords: ["capture", "캡처"],
      href: "/capture",
    },
  ],
};
