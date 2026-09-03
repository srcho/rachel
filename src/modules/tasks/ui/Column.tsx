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
        "flex w-[78vw] shrink-0 snap-start flex-col rounded-lg bg-muted/50 md:w-72",
        isOver && "ring-2 ring-ring/40",
      )}
    >
      <header className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <h2 className="text-sm font-medium">
          {column.name}
          <span
            className={cn(
              "ml-1.5 text-xs tabular-nums text-muted-foreground",
              over && "text-red-500",
            )}
          >
            {cards.length}
            {column.wip_limit !== null && `/${column.wip_limit}`}
          </span>
        </h2>
      </header>
      <div
        ref={setNodeRef}
        className="flex min-h-10 flex-1 flex-col gap-1.5 px-2 pb-2"
      >
        <SortableContext
          items={cards.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((card) => (
            <SortableCard key={card.id} card={card} onOpen={onOpen} />
          ))}
        </SortableContext>
        <QuickAdd onAdd={onAdd} />
      </div>
    </section>
  );
}
