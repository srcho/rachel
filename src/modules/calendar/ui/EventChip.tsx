"use client";
import { cn } from "@/lib/utils";
import {
  type Occurrence,
  occurrenceLabel,
  occurrenceShortLabel,
} from "../occurrences";
import type { EventRow } from "../repository";
import type { CalendarInfo } from "./CalendarScreen";

/** 일정 한 조각(하루치). 여러 날에 걸친 일정은 첫날/계속/마지막 라벨로 구분한다. */
export function EventChip({
  occurrence: o,
  calendars,
  timezone,
  compact,
  onOpen,
}: {
  occurrence: Occurrence<EventRow>;
  calendars: CalendarInfo[];
  timezone: string;
  compact?: boolean;
  onOpen: (e: EventRow) => void;
}) {
  const event = o.event;
  const color =
    calendars.find((c) => c.id === event.calendar_id)?.color ??
    "var(--primary)";
  const pending = event.sync_status !== "synced";
  const continuing = o.dayCount > 1 && !o.isStart;
  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      className={cn(
        "flex w-full items-start gap-2 rounded-md border-l-2 bg-card px-2 py-1 text-left text-sm hover:bg-accent/50",
        compact && "py-0.5 text-xs",
        pending && "opacity-70",
        continuing && "border-dashed",
      )}
      style={{ borderLeftColor: color }}
    >
      {!compact && (
        <span className="w-[5.5rem] shrink-0 tabular-nums text-muted-foreground">
          {occurrenceLabel(o, timezone)}
        </span>
      )}
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          continuing && "text-muted-foreground",
        )}
      >
        {compact && (
          <span className="mr-1 tabular-nums text-muted-foreground">
            {occurrenceShortLabel(o, timezone)}
          </span>
        )}
        {event.title}
        {pending && (
          <span className="ml-1 text-[10px] text-muted-foreground">
            {event.sync_status === "conflict" ? "충돌" : "동기화 대기"}
          </span>
        )}
      </span>
      {!compact && event.location && (
        <span className="hidden max-w-[30%] truncate text-xs text-muted-foreground sm:block">
          {event.location}
        </span>
      )}
    </button>
  );
}
