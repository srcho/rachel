"use client";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { addDays } from "../format";
import { expandOccurrences, occurrenceLabel } from "../occurrences";
import type { EventRow } from "../repository";
import { layoutDay } from "../time-grid";
import type { CalendarInfo } from "./CalendarScreen";
import { EventChip } from "./EventChip";

interface Props {
  events: EventRow[];
  weekStart: string;
  today: string;
  timezone: string;
  calendars: CalendarInfo[];
  onOpen: (event: EventRow) => void;
  onAdd: (ymd: string, hour?: number) => void;
}
const DOW = ["월", "화", "수", "목", "금", "토", "일"];
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
  const byDay = useMemo(
    () => expandOccurrences(events, weekStart, addDays(weekStart, 7), timezone),
    [events, weekStart, timezone],
  );
  const layouts = days.map((date) =>
    layoutDay(byDay.get(date) ?? [], timezone),
  );
  const all = layouts.flat();
  const startHour = Math.min(8, ...all.map((r) => Math.floor(r.start / 60)));
  const endHour = Math.max(20, ...all.map((r) => Math.ceil(r.end / 60)));
  const hours = Array.from(
    { length: endHour - startHour },
    (_, i) => startHour + i,
  );
  return (
    <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
      <div className="min-w-[760px]">
        <div className="sticky top-0 z-20 grid grid-cols-[2.5rem_repeat(7,minmax(0,1fr))] border-b bg-background">
          <span className="pt-3 text-xs text-muted-foreground">종일</span>
          {days.map((date, i) => (
            <div key={date} className="min-w-0 border-l px-1 pb-1">
              <button
                type="button"
                className={cn(
                  "min-h-11 w-full text-sm",
                  date === today &&
                    "font-semibold underline underline-offset-4",
                )}
                onClick={() => onAdd(date)}
              >
                {DOW[i]} {Number(date.slice(8))}
              </button>
              {(byDay.get(date) ?? [])
                .filter((o) => o.event.all_day)
                .map((o) => (
                  <EventChip
                    key={o.event.id}
                    occurrence={o}
                    calendars={calendars}
                    timezone={timezone}
                    compact
                    onOpen={onOpen}
                  />
                ))}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[2.5rem_repeat(7,minmax(0,1fr))]">
          <div>
            {hours.map((hour) => (
              <div
                key={hour}
                className="h-14 pt-1 text-xs tabular-nums text-muted-foreground"
              >
                {String(hour).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {days.map((date, i) => (
            <div
              key={date}
              className="relative border-l"
              style={{ height: hours.length * 56 }}
            >
              {hours.map((hour) => (
                <button
                  type="button"
                  key={hour}
                  className="block h-14 w-full border-b border-border/60 hover:bg-muted/50"
                  aria-label={`${date} ${hour}시 일정 추가`}
                  onClick={() => onAdd(date, hour)}
                />
              ))}
              {layouts[i]?.map((row) => (
                <button
                  type="button"
                  key={row.occurrence.event.id}
                  className="absolute overflow-hidden rounded-sm border bg-muted px-1 text-left text-xs hover:border-foreground/40"
                  style={{
                    top: ((row.start - startHour * 60) * 56) / 60,
                    height: Math.max(22, ((row.end - row.start) * 56) / 60),
                    left: `${(row.lane * 100) / row.lanes}%`,
                    width: `calc(${100 / row.lanes}% - 2px)`,
                  }}
                  onClick={() => onOpen(row.occurrence.event)}
                  title={`${row.occurrence.event.title} · ${occurrenceLabel(row.occurrence, timezone)}`}
                >
                  <span className="block truncate font-medium">
                    {row.occurrence.event.title}
                  </span>
                  <span className="block truncate text-muted-foreground">
                    {occurrenceLabel(row.occurrence, timezone)}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
