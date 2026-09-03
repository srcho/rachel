"use client";
import { localYmd } from "@/core/utils/date";
import { cn } from "@/lib/utils";
import { addDays, startOfMonth, startOfWeek } from "../format";
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
  const byDay = new Map<string, EventRow[]>();
  for (const e of events) {
    const ymd = localYmd(new Date(e.start_at), timezone);
    byDay.set(ymd, [...(byDay.get(ymd) ?? []), e]);
  }
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
          const items = (byDay.get(ymd) ?? []).sort(
            (a, b) =>
              Number(b.all_day) - Number(a.all_day) ||
              a.start_at.localeCompare(b.start_at),
          );
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
                {items.slice(0, MAX_PER_CELL).map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onOpen(e)}
                    className="block w-full truncate rounded px-1 text-left text-[11px] leading-[18px] hover:bg-accent"
                    style={{
                      background: `${calendars.find((c) => c.id === e.calendar_id)?.color ?? "#888"}22`,
                    }}
                  >
                    {e.title}
                  </button>
                ))}
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
