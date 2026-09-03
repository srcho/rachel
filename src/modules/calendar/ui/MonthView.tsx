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
    <div className="px-2 pb-6">
      <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground">
        {DOW.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border bg-border">
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
                "min-h-20 bg-background p-1",
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
              <div className="space-y-px">
                {items.slice(0, 3).map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onOpen(e)}
                    className="block w-full truncate rounded px-1 text-left text-[10px] leading-4 hover:bg-accent"
                    style={{
                      background: `${calendars.find((c) => c.id === e.calendar_id)?.color ?? "#888"}22`,
                    }}
                  >
                    {e.title}
                  </button>
                ))}
                {items.length > 3 && (
                  <p className="px-1 text-[10px] text-muted-foreground">
                    +{items.length - 3}
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
