import type { RachelModule } from "@/core/contracts";
import { CalendarSettings } from "./ui/CalendarSettings";

/** calendar 모듈. 동기화 잡·도구·뷰는 S2.2~S2.4 에서 채운다. */
export const calendarModule: RachelModule = {
  manifest: {
    id: "calendar",
    name: "일정",
    icon: "calendar-days",
    nav: { href: "/calendar", order: 30, mobileTab: true },
    schemaVersion: 6,
  },
  settings: {
    id: "calendar",
    title: "Google 캘린더",
    order: 20,
    Component: CalendarSettings,
  },
};
