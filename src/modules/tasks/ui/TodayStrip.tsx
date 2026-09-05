"use client";
import { useDraggable } from "@dnd-kit/core";
import { CalendarDays, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StripEvent {
  id: string;
  title: string;
  /** 오늘 조각의 라벨("10:00–11:00", "종일", "→ 11:00" 등) — 앱 레이어가 계산해 넘긴다 */
  label: string;
  /** 드롭해서 카드를 만들 때의 마감 */
  dueAt: string;
  dueHasTime: boolean;
  /** 이미 이 일정에서 만든 카드가 있음 */
  linked: boolean;
}

/**
 * 보드 상단 "오늘 일정" 스트립(읽기 전용). 캘린더 → 할 일 단방향.
 * 칩을 컬럼에 끌어다 놓으면 그때만 카드가 생기고 일정과 연결된다.
 */
export function TodayStrip({ events }: { events: StripEvent[] }) {
  if (events.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 pt-3 text-xs md:px-5">
      <span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground">
        <CalendarDays className="size-3.5" /> 오늘
      </span>
      {events.map((e) => (
        <Chip key={e.id} event={e} time={e.label} />
      ))}
      <span className="text-muted-foreground">
        상태에 끌어다 놓으면 오늘 할 일이 돼요
      </span>
    </div>
  );
}

function Chip({ event, time }: { event: StripEvent; time: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `event:${event.id}`,
    data: { type: "event", event },
    disabled: event.linked,
  });
  return (
    <span
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "inline-flex min-h-7 max-w-full select-none items-center gap-1.5 rounded-md border bg-card px-2 whitespace-nowrap",
        event.linked
          ? "text-muted-foreground"
          : "cursor-grab hover:border-foreground/25 active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
      title={
        event.linked ? "이미 연결된 할 일이 있어요" : "컬럼으로 끌어다 놓기"
      }
    >
      <span className="shrink-0 tabular-nums text-muted-foreground">
        {time}
      </span>
      <span className="min-w-0 max-w-[14rem] truncate">{event.title}</span>
      {event.linked && <Check className="size-3" />}
    </span>
  );
}

/** DragOverlay 용 고스트 */
export function ChipGhost({ event }: { event: StripEvent }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-card px-2 text-xs shadow-lg ring-1 ring-ring/40">
      <span className="truncate">{event.title}</span>
    </span>
  );
}
