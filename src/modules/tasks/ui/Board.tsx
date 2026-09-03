"use client";
import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { registerOutboxHandler, runOrQueue } from "@/core/offline/outbox";
import { useTableChanges } from "@/core/realtime/useTableChanges";
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

type ByColumn = Record<string, CardRow[]>;

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
}: {
  initial: BoardView;
  userId: string;
}) {
  const router = useRouter();
  const [columns, setColumns] = useState(initial.columns);
  const [byColumn, setByColumn] = useState<ByColumn>(() =>
    group(initial.columns, initial.cards),
  );
  const [active, setActive] = useState<CardRow | null>(null);
  /** 드래그 고스트를 원래 카드와 같은 폭으로 그린다 */
  const [activeWidth, setActiveWidth] = useState<number | undefined>();
  const [open, setOpen] = useState<CardRow | null>(null);
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

  function onDragStart(e: DragStartEvent) {
    setActive(find(String(e.active.id)) ?? null);
    setActiveWidth(e.active.rect.current.initial?.width);
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
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
    if (!over) return;
    const id = String(active.id);
    const to = columnOf(String(over.id));
    if (!to) return;
    const snapshot = byColumn;
    setByColumn((prev) => {
      const list = [...(prev[to] ?? [])];
      const fromIndex = list.findIndex((c) => c.id === id);
      let toIndex = list.findIndex((c) => c.id === over.id);
      if (fromIndex < 0) return prev;
      if (toIndex < 0 || over.id === to) toIndex = list.length - 1;
      const [moved] = list.splice(fromIndex, 1);
      if (!moved) return prev;
      list.splice(toIndex, 0, moved);
      const after = list[toIndex - 1];
      const before = list[toIndex + 1];
      void run(
        "이동",
        () =>
          moveCardAction(id, {
            columnId: to,
            afterId: after?.id ?? null,
            beforeId: before?.id ?? null,
          }),
        () => setByColumn(snapshot),
        {
          action: "tasks.move",
          args: [
            id,
            {
              columnId: to,
              afterId: after?.id ?? null,
              beforeId: before?.id ?? null,
            },
          ],
        },
      );
      return { ...prev, [to]: list };
    });
  }

  async function add(
    columnId: string,
    input: { title: string; dueAt?: string; dueHasTime?: boolean },
  ) {
    const temp: CardRow = {
      id: `temp-${crypto.randomUUID()}`,
      user_id: userId,
      board_id: initial.board.id,
      column_id: columnId,
      title: input.title,
      description_md: "",
      position: "~",
      priority: 2,
      due_at: input.dueAt ?? null,
      due_has_time: input.dueHasTime ?? false,
      labels: [],
      checklist: [],
      source: { type: "manual" },
      calendar_event_id: null,
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

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActive(null)}
      >
        <div className="flex h-[calc(100dvh-6.5rem-env(safe-area-inset-bottom))] snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden px-4 py-3 md:h-full md:snap-none">
          {columns.map((col) => (
            <Column
              key={col.id}
              column={col}
              cards={byColumn[col.id] ?? []}
              onOpen={setOpen}
              onAdd={(input) => add(col.id, input)}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {active ? (
            <div style={{ width: activeWidth }}>
              <CardBody card={active} dragging />
            </div>
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
