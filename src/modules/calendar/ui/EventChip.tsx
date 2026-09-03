"use client";
import { cn } from "@/lib/utils";
import { eventTimeLabel } from "../format";
import type { EventRow } from "../repository";
import type { CalendarInfo } from "./CalendarScreen";

export function EventChip({
  event,
  calendars,
  timezone,
  compact,
  onOpen,
}: {
  event: EventRow;
  calendars: CalendarInfo[];
  timezone: string;
  compact?: boolean;
  onOpen: (e: EventRow) => void;
}) {
  const color =
    calendars.find((c) => c.id === event.calendar_id)?.color ??
    "var(--primary)";
  const pending = event.sync_status !== "synced";
  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      className={cn(
        "flex w-full items-start gap-2 rounded-md border-l-2 bg-card px-2 py-1 text-left text-sm hover:bg-accent/50",
        compact && "py-0.5 text-xs",
        pending && "opacity-70",
      )}
      style={{ borderLeftColor: color }}
    >
      {!compact && (
        <span className="w-[5.5rem] shrink-0 tabular-nums text-muted-foreground">
          {eventTimeLabel(event, timezone)}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">
        {compact && !event.all_day && (
          <span className="mr-1 tabular-nums text-muted-foreground">
            {eventTimeLabel(event, timezone).split("–")[0]}
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
