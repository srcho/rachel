"use client";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import type { CardRow, ColumnRow } from "../repository";
import { SortableCard } from "./Card";

export function Column({
  column,
  cards,
  onOpen,
  footer,
}: {
  column: ColumnRow;
  cards: CardRow[];
  onOpen: (card: CardRow) => void;
  /** 컬럼 바닥(예: Done 의 "이전 완료 N개") */
  footer?: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: "column", columnId: column.id },
  });
  const over = column.wip_limit !== null && cards.length > column.wip_limit;
  return (
    <section
      aria-label={column.name}
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col rounded-lg border bg-muted/40 transition-colors md:min-w-64 md:max-w-sm md:flex-1 md:shrink",
        isOver && "border-foreground/30 bg-muted/70",
      )}
    >
      <header className="flex h-9 shrink-0 items-center gap-1.5 px-2.5 md:h-10 md:px-3">
        <h2 className="truncate text-[13px] font-medium">{column.name}</h2>
        <span
          className={cn(
            "text-xs tabular-nums text-muted-foreground",
            over && "text-red-500",
          )}
        >
          {cards.length}
          {column.wip_limit !== null && `/${column.wip_limit}`}
        </span>
      </header>
      <div
        ref={setNodeRef}
        className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-1.5 md:px-2"
      >
        <SortableContext
          items={cards.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((card) => (
            <SortableCard key={card.id} card={card} onOpen={onOpen} />
          ))}
        </SortableContext>
      </div>
      {footer ? (
        <div className="shrink-0 px-3 py-2 text-xs text-muted-foreground">
          {footer}
        </div>
      ) : (
        <div className="h-2 shrink-0" />
      )}
    </section>
  );
}
