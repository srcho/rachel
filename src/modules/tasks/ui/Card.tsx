"use client";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckSquare, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { DUE_TONE, formatDue, PRIORITY_DOT } from "../format";
import type { CardRow } from "../repository";

export function CardBody({
  card,
  dragging,
}: {
  card: CardRow;
  dragging?: boolean;
}) {
  const due = formatDue(card);
  const checklist = Array.isArray(card.checklist)
    ? (card.checklist as Array<{ done?: boolean }>)
    : [];
  const doneCount = checklist.filter((c) => c.done).length;
  return (
    <div
      className={cn(
        "rounded-md border bg-card px-2 py-1.5 text-[13px] shadow-xs transition-[border-color,box-shadow] md:px-2.5 md:py-2 md:text-sm",
        dragging
          ? "cursor-grabbing shadow-lg ring-1 ring-ring/40"
          : "hover:border-foreground/25 hover:shadow-sm",
        card.completed_at && "opacity-60",
      )}
    >
      <div className="flex items-start gap-1.5">
        <span
          className={cn(
            "mt-1.5 size-1.5 shrink-0 rounded-full",
            PRIORITY_DOT[card.priority] ?? PRIORITY_DOT[2],
          )}
          role="img"
          aria-label={`우선순위 P${card.priority}`}
        />
        <p
          className={cn(
            "line-clamp-2 flex-1 leading-snug",
            card.completed_at && "line-through",
          )}
        >
          {card.title}
        </p>
      </div>
      {(due ||
        card.labels.length > 0 ||
        checklist.length > 0 ||
        card.meeting_id) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-3 text-[11px] text-muted-foreground">
          {due && (
            <span
              className={cn("font-medium tabular-nums", DUE_TONE[due.tone])}
            >
              {due.text}
            </span>
          )}
          {checklist.length > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <CheckSquare className="size-3" /> {doneCount}/{checklist.length}
            </span>
          )}
          {card.meeting_id && (
            <Mic className="size-3" aria-label="회의에서 생성" />
          )}
          {card.labels.map((l) => (
            <span
              key={l}
              className="rounded bg-accent px-1 py-px text-accent-foreground"
            >
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function SortableCard({
  card,
  onOpen,
}: {
  card: CardRow;
  onOpen: (card: CardRow) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: { type: "card", columnId: card.column_id },
  });
  return (
    <div
      ref={setNodeRef}
      data-card-id={card.id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "touch-manipulation",
        isDragging && "opacity-30 [&_*]:!shadow-none",
      )}
      {...attributes}
      {...listeners}
    >
      <button
        type="button"
        className="w-full cursor-grab text-left active:cursor-grabbing"
        onClick={() => onOpen(card)}
        aria-label={`${card.title} 열기`}
      >
        <CardBody card={card} />
      </button>
    </div>
  );
}
