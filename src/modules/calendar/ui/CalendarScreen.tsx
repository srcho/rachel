"use client";
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTableChanges } from "@/core/realtime/useTableChanges";
import { Page } from "@/core/ui/Page";
import { PageHeader } from "@/core/ui/PageHeader";
import { cn } from "@/lib/utils";
import { syncNowAction } from "../actions";
import { addDays, addMonths, startOfWeek } from "../format";
import type { EventRow } from "../repository";
import { AgendaView } from "./AgendaView";
import { type EventDraft, EventSheet } from "./EventSheet";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";

export type CalendarView = "agenda" | "week" | "month";
export interface CalendarInfo {
  id: string;
  name: string;
  color: string | null;
  writable: boolean;
  selected: boolean;
  isPrimary: boolean;
}

export interface CalendarScreenProps {
  view: CalendarView;
  date: string;
  today: string;
  timezone: string;
  connected: boolean;
  calendars: CalendarInfo[];
  events: EventRow[];
  userId: string;
}

const VIEW_LABEL: Record<CalendarView, string> = {
  agenda: "일정",
  week: "주",
  month: "월",
};

export function CalendarScreen(props: CalendarScreenProps) {
  const { view, date, today, connected, calendars, events, userId, timezone } =
    props;
  const router = useRouter();
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [syncing, startSync] = useTransition();
  const refresh = useCallback(() => router.refresh(), [router]);
  useTableChanges(["calendar_events"], userId, refresh);

  const href = (v: CalendarView, d: string) => `/calendar?view=${v}&date=${d}`;
  const step =
    view === "month"
      ? (n: number) => addMonths(date, n)
      : view === "week"
        ? (n: number) => addDays(startOfWeek(date), 7 * n)
        : (n: number) => addDays(date, 7 * n);
  const title =
    view === "month"
      ? new Intl.DateTimeFormat("ko-KR", {
          year: "numeric",
          month: "long",
        }).format(new Date(`${date}T00:00:00`))
      : new Intl.DateTimeFormat("ko-KR", {
          month: "long",
          day: "numeric",
        }).format(
          new Date(`${view === "week" ? startOfWeek(date) : date}T00:00:00`),
        );

  function openNew(startYmd = today) {
    setDraft({
      id: null,
      title: "",
      startAt: `${startYmd}T09:00`,
      endAt: `${startYmd}T10:00`,
      allDay: false,
      location: "",
      description: "",
      calendarId:
        calendars.find((c) => c.isPrimary && c.writable)?.id ??
        calendars.find((c) => c.writable)?.id ??
        "",
    });
  }
  function openEvent(e: EventRow) {
    setDraft({
      id: e.id,
      title: e.title,
      startAt: toLocalInput(e.start_at, e.all_day, timezone),
      endAt: toLocalInput(e.end_at, e.all_day, timezone),
      allDay: e.all_day,
      location: e.location ?? "",
      description: e.description ?? "",
      calendarId: e.calendar_id,
      etagPending: e.sync_status !== "synced",
    });
  }

  return (
    <>
      <PageHeader
        title={title}
        actions={
          <>
            <div className="flex rounded-lg border p-0.5 text-xs">
              {(["agenda", "week", "month"] as CalendarView[]).map((v) => (
                <Link
                  key={v}
                  href={href(v, date)}
                  className={cn(
                    "rounded-md px-2.5 py-1",
                    v === view
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {VIEW_LABEL[v]}
                </Link>
              ))}
            </div>
            <Button asChild size="icon" variant="ghost" className="size-8">
              <Link href={href(view, step(-1))} aria-label="이전">
                <ChevronLeft className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs"
            >
              <Link href={href(view, today)}>오늘</Link>
            </Button>
            <Button asChild size="icon" variant="ghost" className="size-8">
              <Link href={href(view, step(1))} aria-label="다음">
                <ChevronRight className="size-4" />
              </Link>
            </Button>
            {connected && (
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label="지금 동기화"
                disabled={syncing}
                onClick={() =>
                  startSync(async () => {
                    await syncNowAction();
                    toast.success("동기화를 시작했어요");
                  })
                }
              >
                <RefreshCw
                  className={cn("size-4", syncing && "animate-spin")}
                />
              </Button>
            )}
            <Button
              size="icon"
              className="size-8"
              aria-label="일정 추가"
              onClick={() => openNew(date)}
              disabled={!calendars.some((c) => c.writable)}
            >
              <Plus className="size-4" />
            </Button>
          </>
        }
      />
      <Page width="full" className="flex flex-col">
        {!connected ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            <p>Google 캘린더가 연결되지 않았어요.</p>
            <Button asChild size="sm" className="mt-3">
              <Link
                href="/api/integrations/google/start?next=/calendar"
                prefetch={false}
              >
                Google 캘린더 연결
              </Link>
            </Button>
          </div>
        ) : view === "agenda" ? (
          <AgendaView
            events={events}
            fromYmd={date}
            days={14}
            today={today}
            timezone={timezone}
            calendars={calendars}
            onOpen={openEvent}
            onAdd={openNew}
          />
        ) : view === "week" ? (
          <WeekView
            events={events}
            weekStart={startOfWeek(date)}
            today={today}
            timezone={timezone}
            calendars={calendars}
            onOpen={openEvent}
            onAdd={openNew}
          />
        ) : (
          <MonthView
            events={events}
            monthDate={date}
            today={today}
            timezone={timezone}
            calendars={calendars}
            onOpen={openEvent}
            onAdd={openNew}
          />
        )}
      </Page>
      <EventSheet
        draft={draft}
        calendars={calendars}
        onClose={() => setDraft(null)}
        onSaved={refresh}
      />
    </>
  );
}

function toLocalInput(iso: string, allDay: boolean, tz: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "00";
  const ymd = `${get("year")}-${get("month")}-${get("day")}`;
  return allDay ? ymd : `${ymd}T${get("hour")}:${get("minute")}`;
}
