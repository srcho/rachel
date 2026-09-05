"use client";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { addDays, fmtDayHeader } from "../format";
import { expandOccurrences } from "../occurrences";
import type { EventRow } from "../repository";
import type { CalendarInfo } from "./CalendarScreen";
import { EventChip } from "./EventChip";

interface Props {
  events: EventRow[];
  fromYmd: string;
  days: number;
  today: string;
  timezone: string;
  calendars: CalendarInfo[];
  onOpen: (e: EventRow) => void;
  onAdd: (ymd: string) => void;
}

/** 날짜별 그룹, sticky 헤더, 오늘에는 현재 시각 라인 */
export function AgendaView({
  events,
  fromYmd,
  days,
  today,
  timezone,
  calendars,
  onOpen,
  onAdd,
}: Props) {
  const list = Array.from({ length: days }, (_, i) => addDays(fromYmd, i));
  const byDay = useMemo(
    () => expandOccurrences(events, fromYmd, addDays(fromYmd, days), timezone),
    [events, fromYmd, days, timezone],
  );
  const nowLabel = new Intl.DateTimeFormat("ko-KR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  return (
    <div className="px-4 pb-6 md:min-h-0 md:flex-1 md:overflow-y-auto">
      <div className="mx-auto max-w-3xl xl:max-w-6xl xl:columns-2 xl:gap-8">
        {list.map((ymd) => {
          const items = byDay.get(ymd) ?? [];
          const isToday = ymd === today;
          return (
            <section
              key={ymd}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "mt-3 rounded-lg px-2 py-2 xl:break-inside-avoid",
                isToday && "bg-muted ring-2 ring-primary/25 ring-inset",
              )}
            >
              <div
                className={cn(
                  "sticky top-0 z-10 flex items-center justify-between rounded-md bg-background/95 py-1 text-xs font-medium backdrop-blur",
                  isToday ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span>
                  {fmtDayHeader(ymd)}
                  {isToday && (
                    <span className="ml-1.5 rounded bg-primary/10 px-1 text-[10px]">
                      오늘 {nowLabel}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => onAdd(ymd)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  + 추가
                </button>
              </div>
              {items.length === 0 ? (
                <p className="py-1 pl-1 text-xs text-muted-foreground/60">
                  일정 없음
                </p>
              ) : (
                <div className="space-y-1 py-1">
                  {items.map((o) => (
                    <EventChip
                      key={`${o.event.id}:${o.dayIndex}`}
                      occurrence={o}
                      calendars={calendars}
                      timezone={timezone}
                      onOpen={onOpen}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
