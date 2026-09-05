import { z } from "zod";
import {
  type AnyAgentTool,
  defineTool,
  type ToolContext,
} from "@/core/contracts";
import type { CardRow, ColumnRow } from "./repository";
import {
  createCardSchema,
  listCardsFilterSchema,
  moveCardSchema,
  updateCardSchema,
} from "./schema";
import { tasksService } from "./service";

/** LLM 에게 보여 줄 압축 카드 표현 */
export interface CardSummary {
  id: string;
  title: string;
  column: string;
  columnId: string;
  priority: number;
  due: string | null;
  labels: string[];
  completed: boolean;
  boardId: string;
}

function summarize(card: CardRow, columns: ColumnRow[]): CardSummary {
  return {
    id: card.id,
    title: card.title,
    column: columns.find((c) => c.id === card.column_id)?.name ?? "?",
    columnId: card.column_id,
    priority: card.priority,
    due: card.due_at,
    labels: card.labels,
    completed: card.completed_at !== null,
    boardId: card.board_id,
  };
}

async function columnsFor(
  ctx: ToolContext,
  boardIds: string[],
): Promise<ColumnRow[]> {
  const svc = tasksService(ctx);
  const ids = [...new Set(boardIds)];
  const views = await Promise.all(
    ids.map((id) => svc.getBoardView(id, { showAllDone: true })),
  );
  return views.flatMap((v) => v.columns);
}

const idSchema = z.object({ id: z.string().uuid().describe("카드 id") });

export const tasksTools: Record<string, AnyAgentTool> = {
  listBoards: defineTool({
    description:
      "보드 목록과 각 보드의 컬럼(id·이름·완료 컬럼 여부)을 돌려준다. 카드를 만들거나 옮기기 전에 컬럼 id 를 알아낼 때 쓴다.",
    inputSchema: z.object({}),
    risk: "read",
    execute: async (_input, ctx) => {
      const svc = tasksService(ctx);
      const boards = await svc.listBoards();
      const views = await Promise.all(
        boards.map((b) => svc.getBoardView(b.id, { showAllDone: true })),
      );
      return views.map((v) => ({
        id: v.board.id,
        name: v.board.name,
        isDefault: v.board.is_default,
        columns: v.columns.map((c) => ({
          id: c.id,
          name: c.name,
          isDone: c.is_done,
          cards: v.cards.filter((x) => x.column_id === c.id).length,
        })),
      }));
    },
  }),
  list: defineTool({
    description:
      "카드 목록. due: today(오늘 마감)·overdue(지연)·week(7일 내)·none(마감 없음). column 이름이나 id, 라벨, 우선순위(0~3), 제목 검색(q)으로 거를 수 있다. 완료 카드는 includeCompleted=true 일 때만.",
    inputSchema: listCardsFilterSchema.extend({
      column: z.string().optional().describe("컬럼 이름(예: Doing) 또는 id"),
    }),
    risk: "read",
    execute: async (input, ctx) => {
      const svc = tasksService(ctx);
      const { column, ...filter } = input;
      let columnId = filter.columnId;
      let boardId = filter.boardId;
      if (column && !columnId) {
        const board = boardId
          ? await svc.getBoardView(boardId, { showAllDone: true })
          : await svc.getBoardView(undefined, { showAllDone: true });
        boardId = board.board.id;
        const col = board.columns.find(
          (c) =>
            c.id === column || c.name.toLowerCase() === column.toLowerCase(),
        );
        if (!col)
          throw new Error(
            `컬럼 "${column}" 을 찾지 못했어요. 컬럼: ${board.columns.map((c) => c.name).join(", ")}`,
          );
        columnId = col.id;
      }
      const cards = await svc.listCards({ ...filter, boardId, columnId });
      const columns = await columnsFor(
        ctx,
        cards.map((c) => c.board_id),
      );
      return cards.map((c) => summarize(c, columns));
    },
  }),
  get: defineTool({
    description: "카드 하나의 전체 내용(설명·체크리스트 포함).",
    inputSchema: idSchema,
    risk: "read",
    execute: async ({ id }, ctx) => {
      const card = await tasksService(ctx).getCard(id);
      if (!card) throw new Error("카드를 찾을 수 없어요");
      const columns = await columnsFor(ctx, [card.board_id]);
      return {
        ...summarize(card, columns),
        description: card.description_md,
        checklist: card.checklist,
        source: card.source,
        createdAt: card.created_at,
      };
    },
  }),
  create: defineTool({
    description:
      "카드를 만든다. columnId 가 없으면 Todo 에. dueAt 은 ISO 8601(타임존 포함). 회의·캡처에서 만들 때는 source 를 채운다.",
    inputSchema: createCardSchema,
    risk: "write",
    execute: async (input, ctx) => {
      const card = await tasksService(ctx).createCard({
        ...input,
        source:
          input.source?.type === "manual" ? { type: "agent" } : input.source,
      });
      const columns = await columnsFor(ctx, [card.board_id]);
      return summarize(card, columns);
    },
    undo: async (output, ctx) => {
      await tasksService(ctx).deleteCard(output.id);
    },
  }),
  update: defineTool({
    description:
      "카드의 제목·설명·우선순위·마감·라벨·체크리스트를 바꾼다. 바꿀 필드만 넘긴다. dueAt: null 은 마감 제거.",
    inputSchema: idSchema.extend({ patch: updateCardSchema }),
    risk: "write",
    execute: async ({ id, patch }, ctx) => {
      const { card, before } = await tasksService(ctx).updateCard(id, patch);
      const columns = await columnsFor(ctx, [card.board_id]);
      return { ...summarize(card, columns), _before: before };
    },
    undo: async (output, ctx) => {
      const b = output._before;
      await tasksService(ctx).updateCard(b.id, {
        title: b.title,
        description: b.description_md,
        priority: b.priority,
        dueAt: b.due_at,
        dueHasTime: b.due_has_time,
        planDate: b.plan_date,
        repeatRule: b.repeat_rule as never,
        calendarEventId: b.calendar_event_id,
        labels: b.labels,
        checklist: b.checklist as never,
      });
    },
  }),
  move: defineTool({
    description:
      "카드를 다른 컬럼으로(또는 같은 컬럼 안에서) 옮긴다. afterId/beforeId 로 순서를 지정할 수 있다. Done 컬럼으로 옮기면 완료 처리된다.",
    inputSchema: idSchema.extend(moveCardSchema.shape),
    risk: "write",
    execute: async ({ id, ...input }, ctx) => {
      const { card, before } = await tasksService(ctx).moveCard(id, input);
      const columns = await columnsFor(ctx, [card.board_id]);
      return {
        ...summarize(card, columns),
        _before: { columnId: before.column_id },
      };
    },
    undo: async (output, ctx) => {
      await tasksService(ctx).moveCard(output.id, {
        columnId: output._before.columnId,
      });
    },
  }),
  complete: defineTool({
    description: "카드를 완료(Done 컬럼으로 이동) 처리한다.",
    inputSchema: idSchema,
    risk: "write",
    execute: async ({ id }, ctx) => {
      const { card, before } = await tasksService(ctx).completeCard(id);
      const columns = await columnsFor(ctx, [card.board_id]);
      return {
        ...summarize(card, columns),
        _before: { columnId: before.column_id },
      };
    },
    undo: async (output, ctx) => {
      await tasksService(ctx).moveCard(output.id, {
        columnId: output._before.columnId,
      });
    },
  }),
  bulkUpdate: defineTool({
    description:
      "여러 카드에 같은 변경(우선순위·마감·라벨)을 한 번에 적용한다. 되돌릴 수 없으니 실행 전에 대상과 변경 내용을 사용자에게 요약해 승인받는다.",
    inputSchema: z.object({
      ids: z.array(z.string().uuid()).min(1).max(100),
      patch: updateCardSchema.pick({
        priority: true,
        dueAt: true,
        dueHasTime: true,
        labels: true,
      }),
    }),
    risk: "destructive",
    execute: async ({ ids, patch }, ctx) => {
      const { cards } = await tasksService(ctx).bulkUpdate(ids, patch);
      const columns = await columnsFor(
        ctx,
        cards.map((c) => c.board_id),
      );
      return {
        count: cards.length,
        cards: cards.map((c) => summarize(c, columns)),
      };
    },
  }),
  archive: defineTool({
    description: "카드를 보관(보드에서 숨김)한다. 삭제와 달리 되돌릴 수 있다.",
    inputSchema: idSchema,
    risk: "write",
    execute: async ({ id }, ctx) => {
      const card = await tasksService(ctx).archiveCard(id, true);
      return { id: card.id, title: card.title };
    },
    undo: async (output, ctx) => {
      await tasksService(ctx).archiveCard(output.id, false);
    },
  }),
  delete: defineTool({
    description:
      "카드를 영구 삭제한다. 되돌릴 수 없다. 보관(archive)으로 충분하면 그쪽을 먼저 권한다.",
    inputSchema: idSchema,
    risk: "destructive",
    execute: async ({ id }, ctx) => {
      const card = await tasksService(ctx).deleteCard(id);
      return { id: card.id, title: card.title };
    },
  }),
};
