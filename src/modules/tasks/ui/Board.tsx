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
import { type MutationResult, runOrQueue } from "@/core/offline/outbox";
import { useTableChanges } from "@/core/realtime/useTableChanges";
import { PageHeader } from "@/core/ui/PageHeader";
import { localYmd } from "@/core/utils/date";
import { cn } from "@/lib/utils";
import { useDock } from "@/modules/agent/dock/store";
import {
  archiveCardAction,
  completeCardAction,
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

/** 화면에 보이는 고스트(DragOverlay)의 세로 중심 — 사용자가 "놓는 자리" 그 자체 */
function ghostCenterY(): number | undefined {
  const el = document.querySelector<HTMLElement>("[data-drag-ghost]");
  if (!el) return undefined;
  const r = el.getBoundingClientRect();
  return r.top + r.height / 2;
}

/**
 * 컬럼 자체 위에 놓았을 때(카드 위가 아닐 때)의 삽입 위치: 드래그 중인 카드의 세로 중심보다 아래에 있는 첫 카드 앞.
 * 예전엔 무조건 맨 끝이라, 긴 컬럼의 위쪽에 놓아도 아래로 갔다.
 */
function insertIndexByY(
  columnId: string,
  activeId: string,
  centerY: number | undefined,
  list: CardRow[],
): number {
  if (centerY === undefined) return list.length;
  const section = document.querySelector<HTMLElement>(
    `section[aria-label][data-column-id="${columnId}"]`,
  );
  if (!section) return list.length;
  const rects = [...section.querySelectorAll<HTMLElement>("[data-card-id]")]
    .map((el) => ({
      id: el.dataset.cardId ?? "",
      r: el.getBoundingClientRect(),
    }))
    .filter((x) => x.id !== activeId);
  const first = rects.find((x) => x.r.top + x.r.height / 2 > centerY);
  if (!first) return list.length;
  const i = list.findIndex((c) => c.id === first.id);
  return i < 0 ? list.length : i;
}

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
  calendarError = false,
  timezone = "Asia/Seoul",
  showAllDone = false,
  archived = false,
  selectedCard = null,
}: {
  initial: BoardView;
  userId: string;
  todayEvents?: StripEvent[];
  calendarError?: boolean;
  timezone?: string;
  showAllDone?: boolean;
  archived?: boolean;
  selectedCard?: CardRow | null;
}) {
  const router = useRouter();
  const [columns, setColumns] = useState(initial.columns);
  const [byColumn, setByColumn] = useState<ByColumn>(() =>
    group(initial.columns, initial.cards),
  );
  const [active, setActive] = useState<CardRow | null>(null);
  const [activeEvent, setActiveEvent] = useState<StripEvent | null>(null);
  /** 드래그 시작 컬럼(하이라이트는 다른 컬럼 위에서만) */
  const [dragFrom, setDragFrom] = useState<string | null>(null);
  /** 드래그 고스트를 원래 카드와 같은 폭으로 그린다 */
  const [activeWidth, setActiveWidth] = useState<number | undefined>();
  const [open, setOpen] = useState<CardRow | null>(selectedCard);
  useEffect(() => {
    useDock.getState().setUi({
      route: `/tasks/${initial.board.id}`,
      label: open ? `현재 할 일: ${open.title}` : initial.board.name,
      entity: {
        type: open ? "card" : "board",
        id: open?.id ?? initial.board.id,
      },
    });
  }, [open, initial.board.id, initial.board.name]);
  function openCard(card: CardRow) {
    if (card.id.startsWith("temp-")) {
      toast.message("저장·전송이 끝나면 수정할 수 있어요.");
      return;
    }
    setOpen(card);
  }
  const [adding, setAdding] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "board">("list");
  const [statusColumn, setStatusColumn] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  useEffect(() => {
    const view = localStorage.getItem("rachel-task-view");
    if (view === "board") setMobileView(view);
  }, []);
  useEffect(() => {
    if (selectedCard) setOpen(selectedCard);
  }, [selectedCard]);

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
      o
        ? (initial.cards.find((c) => c.id === o.id) ??
          (selectedCard?.id === o.id ? selectedCard : null))
        : null,
    );
  }, [initial, selectedCard]);

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
  const find = (id: string) =>
    allCards.find((c) => c.id === id) ?? (open?.id === id ? open : undefined);
  const columnOf = (id: string): string | undefined =>
    byColumn[id] ? id : find(id)?.column_id;

  /** 서버 액션 실행. 네트워크 오류면 아웃박스에 넣고 낙관적 상태를 유지한다. */
  async function run<T>(
    label: string,
    fn: () => Promise<T>,
    rollback?: () => void,
    outbox?: { action: string; args: unknown[] },
  ): Promise<MutationResult<T>> {
    pending.current++;
    let queued = false;
    try {
      if (outbox) {
        const r = await runOrQueue(outbox.action, outbox.args, fn);
        if (r.queued) {
          toast.message(`${label}: 오프라인이라 연결되면 반영해요`);
          queued = true;
          return { status: "queued" };
        }
        return { status: "saved", value: r.result as T };
      }
      return { status: "saved", value: await fn() };
    } catch (e) {
      rollback?.();
      toast.error(
        `${label} 실패: ${e instanceof Error ? e.message : String(e)}`,
      );
      return {
        status: "failed",
        message: e instanceof Error ? e.message : String(e),
      };
    } finally {
      pending.current--;
      if (pending.current === 0 && !queued) refresh();
    }
  }

  const isEventDrag = (data: unknown): data is { event: StripEvent } =>
    Boolean(data && (data as { type?: string }).type === "event");

  function onDragStart(e: DragStartEvent) {
    if (String(e.active.id).startsWith("temp-")) return;
    if (isEventDrag(e.active.data.current)) {
      setActiveEvent(e.active.data.current.event);
      return;
    }
    setActive(find(String(e.active.id)) ?? null);
    setActiveWidth(e.active.rect.current.initial?.width);
    setDragFrom(columnOf(String(e.active.id)) ?? null);
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over || isEventDrag(active.data.current)) return;
    const from = columnOf(String(active.id));
    const to = columnOf(String(over.id));
    if (!from || !to || from === to) return;
    const centerY = ghostCenterY();
    setByColumn((prev) => {
      const card = prev[from]?.find((c) => c.id === active.id);
      if (!card) return prev;
      const fromList = (prev[from] ?? []).filter((c) => c.id !== active.id);
      const toList = [...(prev[to] ?? [])];
      const overIndex = toList.findIndex((c) => c.id === over.id);
      const at =
        overIndex >= 0
          ? overIndex
          : insertIndexByY(to, String(active.id), centerY, toList);
      toList.splice(at, 0, { ...card, column_id: to });
      return { ...prev, [from]: fromList, [to]: toList };
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActive(null);
    setActiveEvent(null);
    setDragFrom(null);
    if (!over) return;
    const to = columnOf(String(over.id));
    if (!to) return;
    if (isEventDrag(active.data.current)) {
      // 캘린더 일정 → 카드(일정과 연결). 이미 카드가 있으면 스트립에서 비활성이라 여기 오지 않는다
      const ev = active.data.current.event;
      void add(to, {
        title: ev.title,
        planDate: localYmd(new Date(), timezone),
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
    if (toIndex < 0 || over.id === to) {
      // 컬럼 자체에 놓음: 포인터 높이로 위치를 정한다(같은 컬럼 안에서 위쪽에 놓아도 위로)
      const centerY = ghostCenterY();
      const without = list.filter((c) => c.id !== id);
      const at = insertIndexByY(to, id, centerY, without);
      toIndex = Math.min(at, list.length - 1);
      if (at >= without.length) toIndex = list.length - 1;
    }
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
    input: Omit<NewCardInput, "columnId"> & {
      calendarEventId?: string;
      planDate?: string;
    },
  ) {
    input = { ...input, creationKey: input.creationKey ?? crypto.randomUUID() };
    const temp: CardRow = {
      id: `temp-${crypto.randomUUID()}`,
      creation_key: input.creationKey ?? null,
      user_id: userId,
      board_id: initial.board.id,
      column_id: columnId,
      title: input.title,
      description_md: input.description ?? "",
      position: "~",
      priority: input.priority ?? 2,
      repeat_rule: null,
      repeat_parent_id: null,
      plan_date: input.planDate ?? null,
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
    if (created.status === "saved")
      setByColumn((prev) => ({
        ...prev,
        [columnId]: (prev[columnId] ?? []).map((c) =>
          c.id === temp.id ? created.value : c,
        ),
      }));
    return created;
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

  const today = localYmd(new Date(), timezone);
  const visible = allCards.filter((card) => {
    const date = card.due_at ? localYmd(new Date(card.due_at), timezone) : null;
    return (
      (!query ||
        `${card.title} ${card.description_md}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase())) &&
      (filter === "all" ||
        (!card.completed_at &&
          (filter === "today"
            ? date === today || card.plan_date === today
            : date !== null && date < today))) &&
      (!priorityFilter || card.priority === Number(priorityFilter)) &&
      (!labelFilter || card.labels.includes(labelFilter))
    );
  });
  const visibleIds = new Set(visible.map((card) => card.id));
  const openCount = allCards.filter((c) => !c.completed_at).length;
  return (
    <>
      <PageHeader
        title={initial.board.name}
        meta={`${archived ? "보관함" : "열린 할 일"} ${openCount}`}
        actions={
          <Button
            size="sm"
            onClick={() => setAdding(true)}
            aria-label="할 일 추가"
          >
            <Plus />
            <span className="hidden sm:inline">할 일 추가</span>
            <kbd className="ml-1 hidden rounded border border-primary-foreground/30 px-1 font-sans text-[10px] md:inline">
              N
            </kbd>
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-1.5 md:px-4">
        {[
          ["all", "전체"],
          ["today", "오늘"],
          ["overdue", "지연"],
        ].map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={filter === value ? "secondary" : "ghost"}
            aria-pressed={filter === value}
            onClick={() => setFilter(value ?? "all")}
          >
            {label}
          </Button>
        ))}
        <input
          aria-label="할 일 검색"
          placeholder="할 일 검색"
          className="h-9 min-w-24 flex-1 rounded-md border bg-background px-2 text-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <details className="relative text-xs">
          <summary className="cursor-pointer px-2 py-3">필터</summary>
          <div className="absolute right-0 z-20 flex w-44 flex-col gap-2 rounded-md border bg-background p-2">
            <select
              aria-label="우선순위 필터"
              className="min-h-9 border bg-background"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="">모든 우선순위</option>
              {[0, 1, 2, 3].map((p) => (
                <option key={p} value={p}>
                  {["긴급", "높음", "보통", "낮음"][p]}
                </option>
              ))}
            </select>
            <select
              aria-label="라벨 필터"
              className="min-h-9 border bg-background"
              value={labelFilter}
              onChange={(e) => setLabelFilter(e.target.value)}
            >
              <option value="">모든 라벨</option>
              {[...new Set(allCards.flatMap((c) => c.labels))].map((label) => (
                <option key={label}>{label}</option>
              ))}
            </select>
          </div>
        </details>
        <Link
          className="px-2 py-3 text-xs text-muted-foreground"
          href={archived ? "?" : "?archived=1"}
        >
          {archived ? "보드로" : "보관함"}
        </Link>
        <Button
          size="sm"
          variant="ghost"
          className="md:hidden"
          onClick={() => {
            const next = mobileView === "list" ? "board" : "list";
            setMobileView(next);
            localStorage.setItem("rachel-task-view", next);
          }}
        >
          {mobileView === "list" ? "보드 보기" : "목록 보기"}
        </Button>
      </div>
      <NewCardDialog
        timezone={timezone}
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
        onDragCancel={() => {
          setActive(null);
          setDragFrom(null);
        }}
      >
        <div className="flex h-[calc(100dvh-6.5rem-env(safe-area-inset-bottom))] flex-col overflow-hidden md:h-full">
          {calendarError && (
            <p role="alert" className="px-3 pt-2 text-xs">
              오늘 일정을 불러오지 못했어요.
              <Button
                size="sm"
                variant="ghost"
                onClick={() => router.refresh()}
              >
                다시 시도
              </Button>
            </p>
          )}
          <TodayStrip events={todayEvents} />
          {mobileView === "list" && (
            <div className="min-h-0 flex-1 overflow-y-auto px-3 md:hidden">
              <nav
                aria-label="할 일 상태"
                className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b bg-background py-1"
              >
                <button
                  type="button"
                  className="min-h-11 shrink-0 px-2 text-sm"
                  aria-pressed={!statusColumn}
                  onClick={() => setStatusColumn("")}
                >
                  전체 {visible.length}
                </button>
                {columns.map((col) => (
                  <button
                    type="button"
                    key={col.id}
                    className={cn(
                      "min-h-11 shrink-0 px-2 text-sm",
                      statusColumn === col.id &&
                        "font-semibold underline underline-offset-8",
                    )}
                    aria-pressed={statusColumn === col.id}
                    onClick={() => setStatusColumn(col.id)}
                  >
                    {col.name}{" "}
                    {visible.filter((c) => c.column_id === col.id).length}
                  </button>
                ))}
              </nav>
              <ul className="divide-y">
                {visible
                  .filter(
                    (card) => !statusColumn || card.column_id === statusColumn,
                  )
                  .map((card) => (
                    <li key={card.id} className="flex items-center gap-1 py-1">
                      <button
                        type="button"
                        disabled={
                          !!card.completed_at || card.id.startsWith("temp-")
                        }
                        className="min-h-11 w-11 shrink-0 text-lg disabled:text-muted-foreground"
                        aria-label={`${card.title} 완료`}
                        onClick={() =>
                          void run("완료", () => completeCardAction(card.id))
                        }
                      >
                        {card.completed_at ? "✓" : "□"}
                      </button>
                      <button
                        type="button"
                        className="min-w-0 flex-1 py-2 text-left"
                        onClick={() => openCard(card)}
                      >
                        <span className="block truncate text-sm">
                          {card.title}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {columns.find((c) => c.id === card.column_id)?.name}
                          {card.due_at
                            ? ` · ${localYmd(new Date(card.due_at), timezone)} 마감`
                            : ""}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
              {visible.length === 0 && (
                <p className="py-6 text-sm text-muted-foreground">
                  조건에 맞는 할 일이 없어요.
                </p>
              )}
              {!showAllDone && initial.hiddenDone > 0 && (
                <Link
                  href="?done=all"
                  className="block py-3 text-xs text-muted-foreground"
                >
                  이전 완료 {initial.hiddenDone}개 보기
                </Link>
              )}
            </div>
          )}
          <div
            className={cn(
              "min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-2 px-3 py-2 md:flex md:gap-3 md:overflow-x-auto md:overflow-y-hidden md:px-4 md:py-3",
              mobileView === "board" ? "grid" : "hidden",
            )}
          >
            {columns.map((col) => (
              <Column
                key={col.id}
                column={col}
                cards={(byColumn[col.id] ?? []).filter((c) =>
                  visibleIds.has(c.id),
                )}
                dragFrom={dragFrom}
                onOpen={openCard}
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
                      "오늘 완료한 할 일만 보여요"
                    )
                  ) : undefined
                }
              />
            ))}
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {active ? (
            <div data-drag-ghost style={{ width: activeWidth }}>
              <CardBody card={active} dragging />
            </div>
          ) : activeEvent ? (
            <ChipGhost event={activeEvent} />
          ) : null}
        </DragOverlay>
      </DndContext>
      <CardSheet
        timezone={timezone}
        card={open}
        columns={columns}
        onClose={() => setOpen(null)}
        onSave={async (id, patch) => {
          const before = find(id);
          patchLocal(id, {
            ...(patch.title !== undefined && { title: patch.title }),
            ...(patch.description !== undefined && {
              description_md: patch.description,
            }),
            ...(patch.priority !== undefined && { priority: patch.priority }),
            ...(patch.planDate !== undefined && { plan_date: patch.planDate }),
            ...(patch.dueAt !== undefined && { due_at: patch.dueAt ?? null }),
            ...(patch.dueHasTime !== undefined && {
              due_has_time: patch.dueHasTime,
            }),
            ...(patch.labels !== undefined && { labels: patch.labels }),
          });
          return run(
            "저장",
            () => updateCardAction(id, patch),
            () => {
              if (before) patchLocal(id, before);
            },
            {
              action: "tasks.update",
              args: [id, patch],
            },
          );
        }}
        onMove={async (id, columnId) => {
          const card = find(id);
          if (!card)
            return { status: "failed", message: "할 일을 찾을 수 없어요" };
          if (card.column_id === columnId)
            return { status: "saved", value: card };
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
          return run(
            "이동",
            () => moveCardAction(id, { columnId }),
            undefined,
            {
              action: "tasks.move",
              args: [id, { columnId }],
            },
          );
        }}
        onArchive={async (id) => {
          const wasArchived = !!find(id)?.archived_at;
          setByColumn((prev) =>
            Object.fromEntries(
              Object.entries(prev).map(([k, list]) => [
                k,
                list.filter((c) => c.id !== id),
              ]),
            ),
          );
          return run(
            wasArchived ? "복구" : "보관",
            () => archiveCardAction(id, !wasArchived),
            undefined,
            {
              action: "tasks.archive",
              args: [id, !wasArchived],
            },
          );
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
          return run("삭제", () => deleteCardAction(id), undefined, {
            action: "tasks.delete",
            args: [id],
          });
        }}
      />
    </>
  );
}
