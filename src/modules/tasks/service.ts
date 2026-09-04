import { generateKeyBetween } from "fractional-indexing";
import type { ServiceContext } from "@/core/contracts";
import type { Json } from "@/core/db/types.generated";
import { dayBounds } from "@/core/utils/date";
import {
  type BoardRow,
  type CardRow,
  type ColumnRow,
  tasksRepository,
} from "./repository";
import {
  type CreateCardInput,
  createCardSchema,
  DEFAULT_COLUMNS,
  type ListCardsFilter,
  listCardsFilterSchema,
  type MoveCardInput,
  moveCardSchema,
  TASK_EVENTS,
  type UpdateCardInput,
  updateCardSchema,
} from "./schema";

export interface BoardView {
  board: BoardRow;
  columns: ColumnRow[];
  cards: CardRow[];
  /** 오늘(타임존 기준) 전에 완료돼 숨겨진 카드 수 */
  hiddenDone: number;
}

/**
 * tasks 규칙. Server Action 과 에이전트 도구가 함께 쓴다.
 * 모든 변경은 도메인 이벤트를 발행한다.
 */
/** 다른 모듈(Google Tasks 미러 등)이 이벤트만 보고 쓸 수 있는 카드 스냅샷 */
export function cardSnapshot(card: CardRow) {
  return {
    id: card.id,
    title: card.title,
    description: card.description_md,
    dueAt: card.due_at,
    dueHasTime: card.due_has_time,
    completed: card.completed_at !== null,
    archived: card.archived_at !== null,
    boardId: card.board_id,
    updatedAt: card.updated_at,
  };
}
export type CardSnapshot = ReturnType<typeof cardSnapshot>;

/** 외부(Google)에서 온 변경임을 이벤트에 표시해 되밀기(루프)를 막는다 */
export interface WriteMeta {
  origin?: "google";
  gtaskId?: string;
}

export function tasksService(ctx: ServiceContext) {
  const repo = tasksRepository(ctx.db, ctx.userId);

  async function ensureDefaultBoard(): Promise<BoardRow> {
    const existing = await repo.findDefaultBoard();
    if (existing) return existing;
    const board = await repo.insertBoard({
      name: "Personal",
      position: "a0",
      is_default: true,
    });
    let pos: string | null = null;
    const rows = DEFAULT_COLUMNS.map((c) => {
      pos = generateKeyBetween(pos, null);
      return {
        board_id: board.id,
        name: c.name,
        position: pos,
        is_done: c.isDone,
      };
    });
    await repo.insertColumns(rows);
    return board;
  }

  /**
   * 보드 화면 데이터. 기본은 Done 에 "오늘 완료"만 보인다(어제 이전 완료는 숨김, 개수만).
   * showAllDone 이면 전부.
   */
  async function getBoardView(
    boardId?: string,
    opts: { showAllDone?: boolean } = {},
  ): Promise<BoardView> {
    const board = boardId
      ? await repo.getBoard(boardId)
      : await ensureDefaultBoard();
    if (!board) throw new Error("보드를 찾을 수 없어요");
    const todayStart = dayBounds(ctx.now, ctx.timezone).start;
    const [columns, cards, hiddenDone] = await Promise.all([
      repo.listColumns(board.id),
      repo.listCardsByBoard(
        board.id,
        opts.showAllDone ? {} : { completedSince: todayStart },
      ),
      opts.showAllDone
        ? Promise.resolve(0)
        : repo.countCompletedBefore(board.id, todayStart),
    ]);
    return { board, columns, cards, hiddenDone };
  }

  async function resolveColumn(
    boardId: string,
    columnId?: string,
  ): Promise<ColumnRow> {
    const columns = await repo.listColumns(boardId);
    if (columnId) {
      const col = columns.find((c) => c.id === columnId);
      if (!col) throw new Error("컬럼을 찾을 수 없어요");
      return col;
    }
    const todo =
      columns.find((c) => c.name.toLowerCase() === "todo") ??
      columns.find((c) => !c.is_done);
    if (!todo) throw new Error("보드에 컬럼이 없어요");
    return todo;
  }

  async function createCard(
    raw: CreateCardInput,
    meta: WriteMeta = {},
  ): Promise<CardRow> {
    const input = createCardSchema.parse(raw);
    const board = input.boardId
      ? await repo.getBoard(input.boardId)
      : await ensureDefaultBoard();
    if (!board) throw new Error("보드를 찾을 수 없어요");
    const column = await resolveColumn(board.id, input.columnId);
    const last = await repo.lastCardInColumn(column.id);
    const card = await repo.insertCard({
      board_id: board.id,
      column_id: column.id,
      title: input.title,
      description_md: input.description,
      position: generateKeyBetween(last?.position ?? null, null),
      priority: input.priority,
      due_at: input.dueAt ?? null,
      due_has_time: input.dueHasTime,
      labels: input.labels,
      checklist: input.checklist as unknown as Json,
      source: input.source as unknown as Json,
      calendar_event_id: input.calendarEventId ?? null,
      meeting_id: input.meetingId ?? null,
      completed_at: column.is_done ? ctx.now.toISOString() : null,
    });
    await ctx.emit({
      type: TASK_EVENTS.created,
      entity: { type: "card", id: card.id },
      payload: {
        title: card.title,
        columnId: column.id,
        source: input.source,
        card: cardSnapshot(card),
        ...meta,
      },
    });
    return card;
  }

  async function updateCard(
    id: string,
    raw: UpdateCardInput,
    meta: WriteMeta = {},
  ): Promise<{ card: CardRow; before: CardRow }> {
    const patch = updateCardSchema.parse(raw);
    const before = await repo.getCard(id);
    if (!before) throw new Error("카드를 찾을 수 없어요");
    const card = await repo.updateCard(id, {
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.description !== undefined && {
        description_md: patch.description,
      }),
      ...(patch.priority !== undefined && { priority: patch.priority }),
      ...(patch.dueAt !== undefined && { due_at: patch.dueAt }),
      ...(patch.dueHasTime !== undefined && { due_has_time: patch.dueHasTime }),
      ...(patch.labels !== undefined && { labels: patch.labels }),
      ...(patch.checklist !== undefined && {
        checklist: patch.checklist as unknown as Json,
      }),
      ...(patch.calendarEventId !== undefined && {
        calendar_event_id: patch.calendarEventId,
      }),
      ...(patch.meetingId !== undefined && { meeting_id: patch.meetingId }),
    });
    await ctx.emit({
      type: TASK_EVENTS.updated,
      entity: { type: "card", id },
      payload: {
        fields: Object.keys(patch),
        card: cardSnapshot(card),
        ...meta,
      },
    });
    return { card, before };
  }

  /** 컬럼 간·컬럼 내 이동. 이웃 두 카드 사이의 키를 생성하므로 1행만 갱신된다. */
  async function moveCard(
    id: string,
    raw: MoveCardInput,
    meta: WriteMeta = {},
  ): Promise<{ card: CardRow; before: CardRow }> {
    const input = moveCardSchema.parse(raw);
    const before = await repo.getCard(id);
    if (!before) throw new Error("카드를 찾을 수 없어요");
    const target = await repo.getColumn(input.columnId);
    if (!target || target.board_id !== before.board_id)
      throw new Error("같은 보드의 컬럼으로만 옮길 수 있어요");

    let afterPos: string | null = null;
    let beforePos: string | null = null;
    if (input.afterId)
      afterPos = (await repo.getCard(input.afterId))?.position ?? null;
    if (input.beforeId)
      beforePos = (await repo.getCard(input.beforeId))?.position ?? null;
    if (!input.afterId && !input.beforeId)
      afterPos = (await repo.lastCardInColumn(target.id))?.position ?? null;
    if (afterPos === before.position) afterPos = null; // 자기 자신 뒤로는 무의미
    if (beforePos === before.position) beforePos = null;
    const position = generateKeyBetween(afterPos, beforePos);

    const wasDone = before.completed_at !== null;
    const nowDone = target.is_done;
    const card = await repo.updateCard(id, {
      column_id: target.id,
      position,
      completed_at: nowDone
        ? (before.completed_at ?? ctx.now.toISOString())
        : null,
    });
    await ctx.emit({
      type: TASK_EVENTS.moved,
      entity: { type: "card", id },
      payload: {
        from: before.column_id,
        to: target.id,
        card: cardSnapshot(card),
        ...meta,
      },
    });
    if (!wasDone && nowDone)
      await ctx.emit({
        type: TASK_EVENTS.completed,
        entity: { type: "card", id },
        payload: { title: card.title, card: cardSnapshot(card), ...meta },
      });
    if (wasDone && !nowDone)
      await ctx.emit({
        type: TASK_EVENTS.reopened,
        entity: { type: "card", id },
        payload: { card: cardSnapshot(card), ...meta },
      });
    return { card, before };
  }

  async function completeCard(
    id: string,
    meta: WriteMeta = {},
  ): Promise<{ card: CardRow; before: CardRow }> {
    const before = await repo.getCard(id);
    if (!before) throw new Error("카드를 찾을 수 없어요");
    const columns = await repo.listColumns(before.board_id);
    const done = columns.find((c) => c.is_done);
    if (!done) throw new Error("완료 컬럼이 없어요");
    return moveCard(id, { columnId: done.id }, meta);
  }

  /** 완료 컬럼 밖(Todo 우선, 없으면 첫 미완료 컬럼)으로 되돌린다 */
  async function reopenCard(
    id: string,
    meta: WriteMeta = {},
  ): Promise<{ card: CardRow; before: CardRow }> {
    const before = await repo.getCard(id);
    if (!before) throw new Error("카드를 찾을 수 없어요");
    const columns = await repo.listColumns(before.board_id);
    const target =
      columns.find((c) => !c.is_done && c.name.toLowerCase() === "todo") ??
      columns.find((c) => !c.is_done);
    if (!target) throw new Error("되돌릴 컬럼이 없어요");
    return moveCard(id, { columnId: target.id }, meta);
  }

  async function archiveCard(id: string, archived = true): Promise<CardRow> {
    const card = await repo.updateCard(id, {
      archived_at: archived ? ctx.now.toISOString() : null,
    });
    await ctx.emit({
      type: TASK_EVENTS.archived,
      entity: { type: "card", id },
      payload: { archived, card: cardSnapshot(card) },
    });
    return card;
  }

  async function deleteCard(id: string): Promise<CardRow> {
    const before = await repo.getCard(id);
    if (!before) throw new Error("카드를 찾을 수 없어요");
    await repo.deleteCard(id);
    await ctx.emit({
      type: TASK_EVENTS.deleted,
      entity: { type: "card", id },
      payload: { title: before.title, card: cardSnapshot(before) },
    });
    return before;
  }

  /** 여러 카드에 같은 패치. 되돌리기를 위해 이전 상태를 돌려준다. */
  async function bulkUpdate(
    ids: string[],
    raw: UpdateCardInput,
  ): Promise<{ cards: CardRow[]; before: CardRow[] }> {
    const patch = updateCardSchema.parse(raw);
    const before = await repo.getCards(ids);
    const cards = await repo.updateCards(
      before.map((c) => c.id),
      {
        ...(patch.priority !== undefined && { priority: patch.priority }),
        ...(patch.dueAt !== undefined && { due_at: patch.dueAt }),
        ...(patch.dueHasTime !== undefined && {
          due_has_time: patch.dueHasTime,
        }),
        ...(patch.labels !== undefined && { labels: patch.labels }),
      },
    );
    for (const c of cards)
      await ctx.emit({
        type: TASK_EVENTS.updated,
        entity: { type: "card", id: c.id },
        payload: {
          fields: Object.keys(patch),
          bulk: true,
          card: cardSnapshot(c),
        },
      });
    return { cards, before };
  }

  async function listCards(
    raw: Partial<ListCardsFilter> = {},
  ): Promise<CardRow[]> {
    const f = listCardsFilterSchema.parse(raw);
    const today = dayBounds(ctx.now, ctx.timezone);
    const week = dayBounds(ctx.now, ctx.timezone, 7);
    const due =
      f.due === "today"
        ? { dueFrom: today.start, dueTo: today.end }
        : f.due === "overdue"
          ? { dueTo: today.start }
          : f.due === "week"
            ? { dueFrom: today.start, dueTo: week.end }
            : f.due === "none"
              ? { dueIsNull: true }
              : {};
    return repo.queryCards({
      boardId: f.boardId,
      columnId: f.columnId,
      label: f.label,
      priority: f.priority,
      includeCompleted: f.includeCompleted,
      q: f.q,
      limit: f.limit,
      ...due,
    });
  }

  async function createColumn(
    boardId: string,
    name: string,
    opts: { isDone?: boolean } = {},
  ): Promise<ColumnRow> {
    const columns = await repo.listColumns(boardId);
    const last = columns.at(-1);
    const [col] = await repo.insertColumns([
      {
        board_id: boardId,
        name,
        position: generateKeyBetween(last?.position ?? null, null),
        is_done: opts.isDone ?? false,
      },
    ]);
    if (!col) throw new Error("컬럼 생성 실패");
    return col;
  }

  async function renameColumn(id: string, name: string): Promise<ColumnRow> {
    return repo.updateColumn(id, { name });
  }

  async function deleteColumn(id: string): Promise<void> {
    const n = await repo.countCardsInColumn(id);
    if (n > 0) throw new Error(`카드가 ${n}장 있어요. 먼저 옮겨 주세요.`);
    await repo.deleteColumn(id);
  }

  return {
    ensureDefaultBoard,
    listBoards: () => repo.listBoards(),
    getBoardView,
    getCard: (id: string) => repo.getCard(id),
    createCard,
    updateCard,
    moveCard,
    completeCard,
    reopenCard,
    archiveCard,
    deleteCard,
    bulkUpdate,
    listCards,
    createColumn,
    renameColumn,
    deleteColumn,
  };
}

export type TasksService = ReturnType<typeof tasksService>;
