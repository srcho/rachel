import type { RachelModule } from "@/core/contracts";
import { calendarContextProvider } from "./context";
import { syncJob } from "./jobs";
import { calendarTools } from "./tools";
import { CalendarSettings } from "./ui/CalendarSettings";
import { todayTimelineWidget } from "./widgets";

/** calendar 모듈: Google 미러·동기화·CRUD·도구·Today 위젯 */
export const calendarModule: RachelModule = {
  manifest: {
    id: "calendar",
    name: "일정",
    icon: "calendar-days",
    nav: { href: "/calendar", order: 30, mobileTab: true },
    schemaVersion: 6,
  },
  tools: calendarTools,
  widgets: [todayTimelineWidget],
  contextProviders: [calendarContextProvider],
  jobs: { sync: syncJob },
  commands: [
    {
      id: "calendar.open",
      label: "캘린더 열기",
      keywords: ["일정", "calendar"],
      run: ({ navigate }) => navigate("/calendar"),
    },
  ],
  settings: {
    id: "calendar",
    title: "Google 캘린더",
    order: 20,
    Component: CalendarSettings,
  },
};
