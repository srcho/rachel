"use client";
import { localYmd } from "@/core/utils/date";
import { cn } from "@/lib/utils";
import { addDays } from "../format";
import type { EventRow } from "../repository";
import type { CalendarInfo } from "./CalendarScreen";
import { EventChip } from "./EventChip";

interface Props {
  events: EventRow[];
  weekStart: string;
  today: string;
  timezone: string;
  calendars: CalendarInfo[];
  onOpen: (e: EventRow) => void;
  onAdd: (ymd: string) => void;
}

const DOW = ["월", "화", "수", "목", "금", "토", "일"];

/** 7열, 각 열은 시간순 목록(종일 먼저). 모바일은 가로 스크롤. */
export function WeekView({
  events,
  weekStart,
  today,
  timezone,
  calendars,
  onOpen,
  onAdd,
}: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const byDay = new Map<string, EventRow[]>();
  for (const e of events) {
    const ymd = localYmd(new Date(e.start_at), timezone);
    byDay.set(ymd, [...(byDay.get(ymd) ?? []), e]);
  }
  return (
    <div className="overflow-x-auto px-2 pb-6">
      <div className="grid min-w-[840px] grid-cols-7 gap-1">
        {days.map((ymd, i) => {
          const items = (byDay.get(ymd) ?? []).sort(
            (a, b) =>
              Number(b.all_day) - Number(a.all_day) ||
              a.start_at.localeCompare(b.start_at),
          );
          const isToday = ymd === today;
          return (
            <div
              key={ymd}
              className={cn(
                "min-h-[60vh] rounded-md border bg-muted/30 p-1",
                isToday && "border-primary/50",
              )}
            >
              <button
                type="button"
                onClick={() => onAdd(ymd)}
                className={cn(
                  "mb-1 flex w-full items-baseline gap-1 px-1 text-xs",
                  isToday ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span>{DOW[i]}</span>
                <span className="text-sm font-medium">
                  {Number(ymd.slice(8))}
                </span>
              </button>
              <div className="space-y-1">
                {items.map((e) => (
                  <EventChip
                    key={e.id}
                    event={e}
                    calendars={calendars}
                    timezone={timezone}
                    compact
                    onOpen={onOpen}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
