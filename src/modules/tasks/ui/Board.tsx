"use client";
import {
  type CollisionDetection,
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { registerOutboxHandler, runOrQueue } from "@/core/offline/outbox";
import { useTableChanges } from "@/core/realtime/useTableChanges";
import { PageHeader } from "@/core/ui/PageHeader";
import {
  archiveCardAction,
  createCardAction,
  deleteCardAction,
  moveCardAction,
  updateCardAction,
} from "../actions";
import type { CardRow, ColumnRow } from "../repository";
import type { BoardView } from "../service";
import { CardBody } from "./Card";
import { CardSheet } from "./CardSheet";
import { Column } from "./Column";
import { NewCardDialog, type NewCardInput } from "./NewCardDialog";
import { ChipGhost, type StripEvent, TodayStrip } from "./TodayStrip";

type ByColumn = Record<string, CardRow[]>;

/**
 * 충돌 판정: 포인터가 들어가 있는 섹션(과 그 안의 카드) 중에서만 고른다.
 * closestCorners 만 쓰면 빈 자리에 놓을 때 이웃 섹션 카드의 모서리가 더 가까워 엉뚱한 컬럼으로 판정된다(2×2 그리드에서 특히).
 */
const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  if (within.length === 0) return closestCorners(args);
  const ids = new Set(within.map((c) => c.id));
  return closestCorners({
    ...args,
    droppableContainers: args.droppableContainers.filter((c) => ids.has(c.id)),
  });
};

registerOutboxHandler("tasks.create", (input) =>
  createCardAction(input as Parameters<typeof createCardAction>[0]),
);
registerOutboxHandler("tasks.update", (id, patch) =>
  updateCardAction(
    id as string,
    patch as Parameters<typeof updateCardAction>[1],
  ),
);
registerOutboxHandler("tasks.move", (id, input) =>
  moveCardAction(id as string, input as Parameters<typeof moveCardAction>[1]),
);
registerOutboxHandler("tasks.archive", (id) => archiveCardAction(id as string));
registerOutboxHandler("tasks.delete", (id) => deleteCardAction(id as string));

function group(columns: ColumnRow[], cards: CardRow[]): ByColumn {
  const by: ByColumn = Object.fromEntries(columns.map((c) => [c.id, []]));
  for (const card of cards) {
    if (!by[card.column_id]) by[card.column_id] = [];
    by[card.column_id]?.push(card);
  }
  for (const id of Object.keys(by))
    by[id]?.sort((a, b) =>
      a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
    );
  return by;
}

export function Board({
  initial,
  userId,
  todayEvents = [],
  timezone = "Asia/Seoul",
  showAllDone = false,
}: {
  initial: BoardView;
  userId: string;
  todayEvents?: StripEvent[];
  timezone?: string;
  showAllDone?: boolean;
}) {
  const router = useRouter();
  const [columns, setColumns] = useState(initial.columns);
  const [byColumn, setByColumn] = useState<ByColumn>(() =>
    group(initial.columns, initial.cards),
  );
  const [active, setActive] = useState<CardRow | null>(null);
  const [activeEvent, setActiveEvent] = useState<StripEvent | null>(null);
  /** 드래그 고스트를 원래 카드와 같은 폭으로 그린다 */
  const [activeWidth, setActiveWidth] = useState<number | undefined>();
  const [open, setOpen] = useState<CardRow | null>(null);
  const [adding, setAdding] = useState(false);

  // N: 카드 추가(입력 중이 아닐 때)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        e.key.toLowerCase() !== "n" ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        t?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(t?.tagName ?? "")
      )
        return;
      e.preventDefault();
      setAdding(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const pending = useRef(0);

  // 서버 데이터가 갱신되면(라우터 refresh) 진행 중 조작이 없을 때만 반영
  useEffect(() => {
    if (pending.current > 0) return;
    setColumns(initial.columns);
    setByColumn(group(initial.columns, initial.cards));
    setOpen((o) =>
      o ? (initial.cards.find((c) => c.id === o.id) ?? null) : null,
    );
  }, [initial]);

  const refresh = useCallback(() => router.refresh(), [router]);
  useTableChanges(["cards", "board_columns"], userId, refresh);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const allCards = useMemo(() => Object.values(byColumn).flat(), [byColumn]);
  const find = (id: string) => allCards.find((c) => c.id === id);
  const columnOf = (id: string): string | undefined =>
    byColumn[id] ? id : find(id)?.column_id;

  /** 서버 액션 실행. 네트워크 오류면 아웃박스에 넣고 낙관적 상태를 유지한다. */
  async function run<T>(
    label: string,
    fn: () => Promise<T>,
    rollback?: () => void,
    outbox?: { action: string; args: unknown[] },
  ): Promise<T | undefined> {
    pending.current++;
    try {
      if (outbox) {
        const r = await runOrQueue(outbox.action, outbox.args, fn);
        if (r.queued) {
          toast.message(`${label}: 오프라인이라 연결되면 반영해요`);
          return undefined;
        }
        return r.result;
      }
      return await fn();
    } catch (e) {
      rollback?.();
      toast.error(
        `${label} 실패: ${e instanceof Error ? e.message : String(e)}`,
      );
      return undefined;
    } finally {
      pending.current--;
      if (pending.current === 0) refresh();
    }
  }

  const isEventDrag = (data: unknown): data is { event: StripEvent } =>
    Boolean(data && (data as { type?: string }).type === "event");

  function onDragStart(e: DragStartEvent) {
    if (isEventDrag(e.active.data.current)) {
      setActiveEvent(e.active.data.current.event);
      return;
    }
    setActive(find(String(e.active.id)) ?? null);
    setActiveWidth(e.active.rect.current.initial?.width);
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over || isEventDrag(active.data.current)) return;
    const from = columnOf(String(active.id));
    const to = columnOf(String(over.id));
    if (!from || !to || from === to) return;
    setByColumn((prev) => {
      const card = prev[from]?.find((c) => c.id === active.id);
      if (!card) return prev;
      const fromList = (prev[from] ?? []).filter((c) => c.id !== active.id);
      const toList = [...(prev[to] ?? [])];
      const overIndex = toList.findIndex((c) => c.id === over.id);
      toList.splice(overIndex >= 0 ? overIndex : toList.length, 0, {
        ...card,
        column_id: to,
      });
      return { ...prev, [from]: fromList, [to]: toList };
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActive(null);
    setActiveEvent(null);
    if (!over) return;
    const to = columnOf(String(over.id));
    if (!to) return;
    if (isEventDrag(active.data.current)) {
      // 캘린더 일정 → 카드(일정과 연결). 이미 카드가 있으면 스트립에서 비활성이라 여기 오지 않는다
      const ev = active.data.current.event;
      void add(to, {
        title: ev.title,
        dueAt: ev.dueAt,
        dueHasTime: ev.dueHasTime,
        calendarEventId: ev.id,
      });
      return;
    }
    const id = String(active.id);
    // setState 업데이터는 순수해야 한다(StrictMode·rebase 에서 재실행) — 계산과 서버 호출은 밖에서
    const snapshot = byColumn;
    const list = [...(snapshot[to] ?? [])];
    const fromIndex = list.findIndex((c) => c.id === id);
    let toIndex = list.findIndex((c) => c.id === over.id);
    if (fromIndex < 0) return;
    if (toIndex < 0 || over.id === to) toIndex = list.length - 1;
    const [moved] = list.splice(fromIndex, 1);
    if (!moved) return;
    list.splice(toIndex, 0, moved);
    const after = list[toIndex - 1];
    const before = list[toIndex + 1];
    setByColumn({ ...snapshot, [to]: list });
    const input = {
      columnId: to,
      afterId: after?.id ?? null,
      beforeId: before?.id ?? null,
    };
    void run(
      "이동",
      () => moveCardAction(id, input),
      () => setByColumn(snapshot),
      { action: "tasks.move", args: [id, input] },
    );
  }

  async function add(
    columnId: string,
    input: Omit<NewCardInput, "columnId"> & { calendarEventId?: string },
  ) {
    const temp: CardRow = {
      id: `temp-${crypto.randomUUID()}`,
      user_id: userId,
      board_id: initial.board.id,
      column_id: columnId,
      title: input.title,
      description_md: input.description ?? "",
      position: "~",
      priority: input.priority ?? 2,
      due_at: input.dueAt ?? null,
      due_has_time: input.dueHasTime ?? false,
      labels: [],
      checklist: [],
      source: { type: "manual" },
      calendar_event_id: input.calendarEventId ?? null,
      meeting_id: null,
      completed_at: null,
      archived_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setByColumn((prev) => ({
      ...prev,
      [columnId]: [...(prev[columnId] ?? []), temp],
    }));
    const payload = { boardId: initial.board.id, columnId, ...input };
    const created = await run(
      "추가",
      () => createCardAction(payload),
      () =>
        setByColumn((prev) => ({
          ...prev,
          [columnId]: (prev[columnId] ?? []).filter((c) => c.id !== temp.id),
        })),
      { action: "tasks.create", args: [payload] },
    );
    if (created)
      setByColumn((prev) => ({
        ...prev,
        [columnId]: (prev[columnId] ?? []).map((c) =>
          c.id === temp.id ? created : c,
        ),
      }));
  }

  function patchLocal(id: string, patch: Partial<CardRow>) {
    setByColumn((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([k, list]) => [
          k,
          list.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        ]),
      ),
    );
    setOpen((o) => (o && o.id === id ? { ...o, ...patch } : o));
  }

  const openCount = allCards.filter((c) => !c.completed_at).length;
  return (
    <>
      <PageHeader
        title={initial.board.name}
        meta={`열린 카드 ${openCount}`}
        actions={
          <Button
            size="sm"
            onClick={() => setAdding(true)}
            aria-label="카드 추가"
          >
            <Plus />
            <span className="hidden sm:inline">카드 추가</span>
            <kbd className="ml-1 hidden rounded border border-primary-foreground/30 px-1 font-sans text-[10px] md:inline">
              N
            </kbd>
          </Button>
        }
      />
      <NewCardDialog
        open={adding}
        columns={columns}
        onClose={() => setAdding(false)}
        onCreate={({ columnId, ...input }) => add(columnId, input)}
      />
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActive(null)}
      >
        <div className="flex h-[calc(100dvh-6.5rem-env(safe-area-inset-bottom))] flex-col overflow-hidden md:h-full">
          <TodayStrip events={todayEvents} />
          {/* 모바일: 고정 2×2 그리드 — 화면은 움직이지 않고 섹션 안에서만 스크롤. 데스크톱: 가로 4열 */}
          <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-2 px-3 py-2 md:flex md:gap-3 md:overflow-x-auto md:overflow-y-hidden md:px-4 md:py-3">
            {columns.map((col) => (
              <Column
                key={col.id}
                column={col}
                cards={byColumn[col.id] ?? []}
                onOpen={setOpen}
                footer={
                  col.is_done ? (
                    showAllDone ? (
                      <Link href="?" className="hover:text-foreground">
                        오늘 완료만 보기
                      </Link>
                    ) : initial.hiddenDone > 0 ? (
                      <Link href="?done=all" className="hover:text-foreground">
                        이전 완료 {initial.hiddenDone}개 보기
                      </Link>
                    ) : (
                      "오늘 완료한 카드만 보여요"
                    )
                  ) : undefined
                }
              />
            ))}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {active ? (
            <div style={{ width: activeWidth }}>
              <CardBody card={active} dragging />
            </div>
          ) : activeEvent ? (
            <ChipGhost event={activeEvent} />
          ) : null}
        </DragOverlay>
      </DndContext>
      <CardSheet
        card={open}
        columns={columns}
        onClose={() => setOpen(null)}
        onSave={async (id, patch) => {
          patchLocal(id, {
            ...(patch.title !== undefined && { title: patch.title }),
            ...(patch.description !== undefined && {
              description_md: patch.description,
            }),
            ...(patch.priority !== undefined && { priority: patch.priority }),
            ...(patch.dueAt !== undefined && { due_at: patch.dueAt ?? null }),
            ...(patch.dueHasTime !== undefined && {
              due_has_time: patch.dueHasTime,
            }),
            ...(patch.labels !== undefined && { labels: patch.labels }),
          });
          await run("저장", () => updateCardAction(id, patch), undefined, {
            action: "tasks.update",
            args: [id, patch],
          });
        }}
        onMove={async (id, columnId) => {
          const card = find(id);
          if (!card || card.column_id === columnId) return;
          setByColumn((prev) => ({
            ...prev,
            [card.column_id]: (prev[card.column_id] ?? []).filter(
              (c) => c.id !== id,
            ),
            [columnId]: [
              ...(prev[columnId] ?? []),
              { ...card, column_id: columnId },
            ],
          }));
          setOpen((o) =>
            o && o.id === id ? { ...o, column_id: columnId } : o,
          );
          await run("이동", () => moveCardAction(id, { columnId }), undefined, {
            action: "tasks.move",
            args: [id, { columnId }],
          });
        }}
        onArchive={async (id) => {
          setByColumn((prev) =>
            Object.fromEntries(
              Object.entries(prev).map(([k, list]) => [
                k,
                list.filter((c) => c.id !== id),
              ]),
            ),
          );
          await run("보관", () => archiveCardAction(id), undefined, {
            action: "tasks.archive",
            args: [id],
          });
        }}
        onDelete={async (id) => {
          setByColumn((prev) =>
            Object.fromEntries(
              Object.entries(prev).map(([k, list]) => [
                k,
                list.filter((c) => c.id !== id),
              ]),
            ),
          );
          await run("삭제", () => deleteCardAction(id), undefined, {
            action: "tasks.delete",
            args: [id],
          });
        }}
      />
    </>
  );
}
