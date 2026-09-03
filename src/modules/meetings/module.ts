import type { RachelModule } from "@/core/contracts";
import { meetingContextProvider } from "./context";
import { postprocessJob } from "./jobs";
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
  widgets: [meetingsWidget],
  contextProviders: [meetingContextProvider],
  jobs: { postprocess: postprocessJob },
  commands: [
    {
      id: "meetings.open",
      label: "회의 목록",
      keywords: ["meeting", "녹음"],
      run: ({ navigate }) => navigate("/meetings"),
    },
  ],
};
