"use client";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { addDays, startOfMonth, startOfWeek } from "../format";
import { expandOccurrences, occurrenceShortLabel } from "../occurrences";
import type { EventRow } from "../repository";
import type { CalendarInfo } from "./CalendarScreen";

interface Props {
  events: EventRow[];
  monthDate: string;
  today: string;
  timezone: string;
  calendars: CalendarInfo[];
  onOpen: (e: EventRow) => void;
  onAdd: (ymd: string) => void;
}

const DOW = ["월", "화", "수", "목", "금", "토", "일"];
const MAX_PER_CELL = 4;

export function MonthView({
  events,
  monthDate,
  today,
  timezone,
  calendars,
  onOpen,
  onAdd,
}: Props) {
  const first = startOfMonth(monthDate);
  const gridStart = startOfWeek(first);
  const month = monthDate.slice(0, 7);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  // 여러 날에 걸친 일정은 덮는 날마다 조각으로(첫날·중간·마지막 표시)
  const byDay = useMemo(
    () =>
      expandOccurrences(events, gridStart, addDays(gridStart, 42), timezone),
    [events, gridStart, timezone],
  );
  return (
    <div className="flex flex-col px-3 pb-3 md:min-h-0 md:flex-1">
      <div className="grid shrink-0 grid-cols-7 text-center text-[11px] text-muted-foreground">
        {DOW.map((d) => (
          <div key={d} className="py-1.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border md:min-h-0 md:flex-1 md:grid-rows-6">
        {cells.map((ymd) => {
          const items = byDay.get(ymd) ?? [];
          const inMonth = ymd.startsWith(month);
          const isToday = ymd === today;
          return (
            <div
              key={ymd}
              className={cn(
                "flex min-h-20 flex-col bg-background p-1 md:min-h-0",
                !inMonth && "bg-muted/40 text-muted-foreground",
              )}
            >
              <button
                type="button"
                onClick={() => onAdd(ymd)}
                className={cn(
                  "mb-0.5 inline-flex size-5 items-center justify-center rounded-full text-[11px]",
                  isToday && "bg-primary text-primary-foreground",
                )}
              >
                {Number(ymd.slice(8))}
              </button>
              <div className="min-h-0 flex-1 space-y-px overflow-hidden">
                {items.slice(0, MAX_PER_CELL).map((o) => {
                  const e = o.event;
                  const short = occurrenceShortLabel(o, timezone);
                  const spans = o.dayCount > 1;
                  return (
                    <button
                      key={`${e.id}:${o.dayIndex}`}
                      type="button"
                      onClick={() => onOpen(e)}
                      title={e.title}
                      className={cn(
                        "block w-full truncate px-1 text-left text-[11px] leading-[18px] hover:bg-accent",
                        // 여러 날: 첫날만 왼쪽 라운드, 마지막날만 오른쪽 라운드 → 이어진 띠처럼
                        !spans
                          ? "rounded"
                          : o.isStart
                            ? "rounded-l"
                            : o.isEnd
                              ? "rounded-r"
                              : "",
                        spans && !o.isStart && "text-muted-foreground",
                      )}
                      style={{
                        background: `${calendars.find((c) => c.id === e.calendar_id)?.color ?? "#888"}${spans ? "33" : "22"}`,
                      }}
                    >
                      {short && (
                        <span className="mr-1 tabular-nums text-muted-foreground">
                          {short}
                        </span>
                      )}
                      {e.title}
                    </button>
                  );
                })}
                {items.length > MAX_PER_CELL && (
                  <p className="px-1 text-[10px] text-muted-foreground">
                    +{items.length - MAX_PER_CELL}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
