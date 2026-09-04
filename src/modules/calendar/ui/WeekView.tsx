"use client";
import { cn } from "@/lib/utils";
import { addDays } from "../format";
import { expandOccurrences } from "../occurrences";
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
  const byDay = expandOccurrences(
    events,
    weekStart,
    addDays(weekStart, 7),
    timezone,
  );
  return (
    <div className="overflow-x-auto px-3 pb-3 md:min-h-0 md:flex-1 md:overflow-x-hidden">
      <div className="grid min-w-[840px] grid-cols-7 gap-1.5 md:h-full md:min-w-0">
        {days.map((ymd, i) => {
          const items = byDay.get(ymd) ?? [];
          const isToday = ymd === today;
          return (
            <div
              key={ymd}
              className={cn(
                "flex min-h-[60vh] flex-col rounded-lg border bg-muted/30 p-1 md:min-h-0",
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
              <div className="min-h-0 flex-1 space-y-1 md:overflow-y-auto">
                {items.map((o) => (
                  <EventChip
                    key={`${o.event.id}:${o.dayIndex}`}
                    occurrence={o}
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
