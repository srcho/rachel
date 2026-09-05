"use client";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CardRow, ColumnRow } from "../repository";
import { SortableCard } from "./Card";

export function Column({
  column,
  cards,
  onOpen,
  onAdd,
  dragFrom,
  footer,
}: {
  column: ColumnRow;
  cards: CardRow[];
  onOpen: (card: CardRow) => void;
  onAdd: () => void;
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
        "min-w-0 rounded-xl border bg-muted/30 transition-colors",
        // 다른 컬럼에서 온 카드가 위에 있을 때만 강조(자기 컬럼 안에서 정렬 중엔 조용히)
        isOver && dragFrom !== column.id && "border-foreground/30 bg-muted/70",
      )}
    >
      <header className="flex min-h-12 items-center gap-2 px-3">
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
        <Button
          size="icon-sm"
          variant="ghost"
          className="ml-auto min-h-[44px] min-w-[44px] shrink-0 text-muted-foreground md:min-h-0 md:min-w-0"
          aria-label={`${column.name}에 할 일 추가`}
          onClick={onAdd}
        >
          <Plus className="size-4" />
        </Button>
      </header>
      {/* 드롭 영역은 섹션 전체(헤더·바닥 포함) — 목록 안 빈 자리뿐 아니라 어디에 놓아도 이 컬럼 */}
      <div className="flex min-h-20 flex-col gap-2 px-2">
        <SortableContext
          items={cards.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((card) => (
            <SortableCard key={card.id} card={card} onOpen={onOpen} />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <p className="px-1 py-4 text-xs text-muted-foreground">
            표시할 할 일이 없어요
          </p>
        )}
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
