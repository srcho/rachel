import type { RachelModule } from "@/core/contracts";
import { meetingContextProvider } from "./context";
import { postprocessJob } from "./jobs";
import { meetingsTools } from "./tools";
import { meetingsWidget } from "./widgets";

/** meetings 모듈: 녹음·2패스 전사·요약. 도구·인덱서·파이널 패스는 S3.5~S3.8 */
export const meetingsModule: RachelModule = {
  manifest: {
    id: "meetings",
    name: "회의",
    icon: "mic",
    nav: { href: "/meetings", order: 35, mobileTab: true },
    schemaVersion: 9,
  },
  tools: meetingsTools,
  widgets: [meetingsWidget],
  contextProviders: [meetingContextProvider],
  jobs: { postprocess: postprocessJob },
  commands: [
    {
      id: "meetings.start",
      label: "녹음 시작",
      keywords: ["record", "회의"],
      action: "startMeeting",
    },
    {
      id: "meetings.open",
      label: "회의 목록",
      keywords: ["meeting", "녹음"],
      href: "/meetings",
    },
  ],
};
