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
  dragFrom,
  footer,
}: {
  column: ColumnRow;
  cards: CardRow[];
  onOpen: (card: CardRow) => void;
  /** 드래그 중인 카드의 출발 컬럼(자기 컬럼이면 강조하지 않는다) */
  dragFrom?: string | null;
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
      ref={setNodeRef}
      data-column-id={column.id}
      aria-label={column.name}
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col rounded-lg border bg-muted/40 transition-colors md:min-w-64 md:max-w-sm md:flex-1 md:shrink",
        // 다른 컬럼에서 온 카드가 위에 있을 때만 강조(자기 컬럼 안에서 정렬 중엔 조용히)
        isOver && dragFrom !== column.id && "border-foreground/30 bg-muted/70",
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
      {/* 드롭 영역은 섹션 전체(헤더·바닥 포함) — 목록 안 빈 자리뿐 아니라 어디에 놓아도 이 컬럼 */}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-1.5 md:px-2">
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
