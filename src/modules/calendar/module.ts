import type { RachelModule } from "@/core/contracts";
import { calendarContextProvider } from "./context";
import { gtasksPushHandler } from "./gtasks-handlers";
import { eventsIndexer } from "./indexer";
import { gtasksPushJob, syncJob } from "./jobs";
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
    schemaVersion: 15,
  },
  indexers: [eventsIndexer],
  tools: calendarTools,
  widgets: [todayTimelineWidget],
  contextProviders: [calendarContextProvider],
  jobs: {
    sync: syncJob,
    gtasks_push: gtasksPushJob,
  },
  eventHandlers: [gtasksPushHandler],
  commands: [
    {
      id: "calendar.open",
      label: "캘린더 열기",
      keywords: ["일정", "calendar"],
      href: "/calendar",
    },
  ],
  settings: {
    id: "calendar",
    title: "Google 캘린더",
    order: 20,
    Component: CalendarSettings,
  },
};
