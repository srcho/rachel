"use client";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import type { CardRow, ColumnRow } from "../repository";
import { SortableCard } from "./Card";
import { QuickAdd } from "./QuickAdd";

export function Column({
  column,
  cards,
  onOpen,
  onAdd,
}: {
  column: ColumnRow;
  cards: CardRow[];
  onOpen: (card: CardRow) => void;
  onAdd: (input: {
    title: string;
    dueAt?: string;
    dueHasTime?: boolean;
  }) => Promise<void>;
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
        "flex h-full min-h-0 w-[78vw] shrink-0 snap-start flex-col rounded-lg border bg-muted/40 transition-colors md:w-auto md:min-w-64 md:max-w-sm md:flex-1 md:shrink",
        isOver && "border-foreground/30 bg-muted/70",
      )}
    >
      <header className="flex h-10 shrink-0 items-center gap-1.5 px-3">
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
        className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2"
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
      <div className="shrink-0 px-2 pt-1.5 pb-2">
        <QuickAdd onAdd={onAdd} />
      </div>
    </section>
  );
}
