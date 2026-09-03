"use client";
import { localYmd } from "@/core/utils/date";
import { cn } from "@/lib/utils";
import { addDays, fmtDayHeader } from "../format";
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
  const byDay = new Map<string, EventRow[]>();
  for (const e of events) {
    const ymd = localYmd(new Date(e.start_at), timezone);
    byDay.set(ymd, [...(byDay.get(ymd) ?? []), e]);
  }
  const list = Array.from({ length: days }, (_, i) => addDays(fromYmd, i));
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
          const items = (byDay.get(ymd) ?? []).sort(
            (a, b) =>
              Number(b.all_day) - Number(a.all_day) ||
              a.start_at.localeCompare(b.start_at),
          );
          const isToday = ymd === today;
          return (
            <section key={ymd} className="pt-3 xl:break-inside-avoid">
              <div
                className={cn(
                  "sticky top-0 z-10 flex items-center justify-between bg-background/95 py-1 text-xs font-medium backdrop-blur",
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
                  {items.map((e) => (
                    <EventChip
                      key={e.id}
                      event={e}
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
