"use client";
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTableChanges } from "@/core/realtime/useTableChanges";
import { Page } from "@/core/ui/Page";
import { PageHeader } from "@/core/ui/PageHeader";
import { cn } from "@/lib/utils";
import { useDock } from "@/modules/agent/dock/store";
import { syncNowAction } from "../actions";
import { addDays, addMonths, startOfWeek } from "../format";
import { eventDays } from "../occurrences";
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
  explicitView?: boolean;
  selectedEvent?: EventRow | null;
  lastSyncedAt?: string | null;
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
  useEffect(() => {
    const from =
      view === "week"
        ? startOfWeek(date)
        : view === "month"
          ? `${date.slice(0, 7)}-01`
          : date;
    const to =
      view === "month"
        ? addDays(addMonths(from, 1), -1)
        : addDays(from, view === "week" ? 6 : 13);
    useDock.getState().setUi({
      route: "/calendar",
      label: draft?.id ? `현재 일정: ${draft.title}` : `${from} ~ ${to} 일정`,
      entity: draft?.id ? { type: "calendar_event", id: draft.id } : undefined,
      dateRange: { from, to },
    });
  }, [draft, date, view]);
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (props.explicitView) {
      localStorage.setItem("rachel-calendar-view", view);
      return;
    }
    const saved = localStorage.getItem("rachel-calendar-view");
    const preferred =
      saved === "agenda" || saved === "week" || saved === "month"
        ? saved
        : window.matchMedia("(max-width: 767px)").matches
          ? "agenda"
          : "week";
    if (preferred !== view)
      router.replace(
        `/calendar?view=${preferred}&date=${date}${props.selectedEvent ? `&event=${props.selectedEvent.id}` : ""}`,
      );
  }, [props.explicitView, props.selectedEvent, view, date, router]);
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

  function openNew(startYmd = today, hour = 9) {
    setDraft({
      id: null,
      title: "",
      startAt: `${startYmd}T${String(hour).padStart(2, "0")}:00`,
      endAt: `${hour === 23 ? addDays(startYmd, 1) : startYmd}T${String((hour + 1) % 24).padStart(2, "0")}:00`,
      allDay: false,
      location: "",
      description: "",
      calendarId:
        calendars.find((c) => c.isPrimary && c.writable)?.id ??
        calendars.find((c) => c.writable)?.id ??
        "",
    });
  }
  const openEvent = useCallback(
    (e: EventRow) => {
      setDraft({
        id: e.id,
        title: e.title,
        startAt: toLocalInput(e.start_at, e.all_day, timezone),
        // 종일의 end_at 은 배타적(다음날 자정) → 편집 창에는 마지막 날(포함)로. 저장 시 하루를 다시 더한다
        endAt: e.all_day
          ? eventDays(e, timezone).last
          : toLocalInput(e.end_at, false, timezone),
        allDay: e.all_day,
        isBusy: e.is_busy,
        location: e.location ?? "",
        description: e.description ?? "",
        calendarId: e.calendar_id,
        etagPending: e.sync_status !== "synced",
        syncStatus: e.sync_status,
        recurring: !!e.recurring_event_id,
      });
    },
    [timezone],
  );
  useEffect(() => {
    if (props.selectedEvent) openEvent(props.selectedEvent);
  }, [props.selectedEvent, openEvent]);

  return (
    <>
      <PageHeader
        splitActions
        title={title}
        actions={
          <>
            <div className="flex rounded-lg border p-0.5 text-xs">
              {(["agenda", "week", "month"] as CalendarView[]).map((v) => (
                <Link
                  key={v}
                  href={href(v, date)}
                  onClick={() =>
                    localStorage.setItem("rachel-calendar-view", v)
                  }
                  className={cn(
                    "flex min-h-10 items-center rounded-md px-2.5 md:min-h-7",
                    v === view
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {VIEW_LABEL[v]}
                </Link>
              ))}
            </div>
            <Button
              asChild
              size="icon"
              variant="ghost"
              className="size-11 md:size-8"
            >
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
            <Button
              asChild
              size="icon"
              variant="ghost"
              className="size-11 md:size-8"
            >
              <Link href={href(view, step(1))} aria-label="다음">
                <ChevronRight className="size-4" />
              </Link>
            </Button>
            {(connected || props.lastSyncedAt) && (
              <Button
                size="icon"
                variant="ghost"
                className="size-11 md:size-8"
                aria-label="지금 동기화"
                disabled={syncing}
                onClick={() =>
                  startSync(async () => {
                    try {
                      await syncNowAction();
                      toast.success("동기화를 시작했어요");
                    } catch {
                      toast.error(
                        "동기화를 시작하지 못했어요. 다시 시도해 주세요.",
                      );
                    }
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
              className="size-11 md:size-8"
              aria-label="일정 추가"
              onClick={() => openNew(date)}
              disabled={!calendars.some((c) => c.writable)}
            >
              <Plus className="size-4" />
            </Button>
          </>
        }
      />
      {connected && (
        <p className="px-4 py-1 text-xs text-muted-foreground">
          {props.lastSyncedAt
            ? `Google 최근 반영 · ${new Intl.DateTimeFormat("ko-KR", { timeZone: timezone, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(props.lastSyncedAt))}`
            : "Google 첫 동기화 대기"}
        </p>
      )}
      <Page width="full" className="flex flex-col">
        {!connected && (
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
        )}
        {view === "agenda" ? (
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
        timezone={timezone}
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
