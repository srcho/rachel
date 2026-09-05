import { z } from "zod";
import {
  type AnyAgentTool,
  defineTool,
  type ToolContext,
} from "@/core/contracts";
import type { CardRow, CardUpdate, ColumnRow } from "./repository";
import {
  scheduleSchema,
  scheduleTaskResult,
  unscheduleTask,
} from "./scheduling";
import {
  createCardSchema,
  listCardsFilterSchema,
  moveCardSchema,
  planCardsSchema,
  updateCardSchema,
} from "./schema";
import { tasksService } from "./service";

/** Shared read projection: every editable value survives a tool round trip. */
function summarize(card: CardRow, columns: ColumnRow[]) {
  return {
    id: card.id,
    title: card.title,
    description: card.description_md,
    column: columns.find((c) => c.id === card.column_id)?.name ?? "?",
    columnId: card.column_id,
    priority: card.priority,
    due: card.due_at,
    dueAt: card.due_at,
    dueHasTime: card.due_has_time,
    planDate: card.plan_date,
    repeatRule: card.repeat_rule,
    calendarEventId: card.calendar_event_id,
    meetingId: card.meeting_id,
    checklist: card.checklist,
    labels: card.labels,
    completed: card.completed_at !== null,
    completedAt: card.completed_at,
    archived: card.archived_at !== null,
    archivedAt: card.archived_at,
    boardId: card.board_id,
    source: card.source,
    repeatParentId: card.repeat_parent_id,
    version: card.updated_at,
    updatedAt: card.updated_at,
    createdAt: card.created_at,
    url: `/tasks/${card.board_id}?card=${card.id}`,
  };
}
export type CardSummary = ReturnType<typeof summarize>;

const patchColumns = {
  title: "title",
  description: "description_md",
  priority: "priority",
  dueAt: "due_at",
  dueHasTime: "due_has_time",
  planDate: "plan_date",
  repeatRule: "repeat_rule",
  calendarEventId: "calendar_event_id",
  meetingId: "meeting_id",
  labels: "labels",
  checklist: "checklist",
} as const;
function undoState(
  before: CardRow,
  card: CardRow,
  fields: Array<keyof CardRow>,
) {
  return {
    inverse: Object.fromEntries(
      fields.map((key) => [key, before[key]]),
    ) as CardUpdate,
    applied: Object.fromEntries(
      fields.map((key) => [key, card[key]]),
    ) as CardUpdate,
    expectedVersion: card.updated_at,
  };
}
async function undoTask(
  output: { id: string; _undo: ReturnType<typeof undoState> },
  ctx: ToolContext,
) {
  await tasksService(ctx).undoPatch(
    output.id,
    output._undo.inverse,
    output._undo.applied,
    output._undo.expectedVersion,
  );
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
      "카드 목록. due: today(오늘 마감)·overdue(지연)·week(7일 내)·none(마감 없음). column 이름이나 id, 라벨, 우선순위(0~3), 제목 검색(q)으로 거를 수 있다. 완료 카드는 includeCompleted=true 일 때만. state=archived로 보관 검색. hasMore이면 nextCursor로 계속 조회하며 현재 페이지를 전체로 보고하지 않는다. 전체 변경은 모든 페이지의 ID를 먼저 수집한 뒤 실행한다.",
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
      const page = await svc.listCardsPage({ ...filter, boardId, columnId });
      const cards = page.items;
      const columns = await columnsFor(
        ctx,
        cards.map((c) => c.board_id),
      );
      return { ...page, items: cards.map((c) => summarize(c, columns)) };
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
      return { ...summarize(card, columns), createdNow: card.createdNow };
    },
    undo: async (output, ctx) => {
      if (output.createdNow)
        await tasksService(ctx).deleteCard(output.id, output.version);
    },
  }),
  update: defineTool({
    description:
      "카드의 제목·설명·우선순위·마감·라벨·체크리스트를 바꾼다. 바꿀 필드만 넘긴다. dueAt: null 은 마감 제거.",
    inputSchema: idSchema.extend({
      patch: updateCardSchema,
      expectedVersion: z.string().optional(),
    }),
    risk: "write",
    execute: async ({ id, patch, expectedVersion }, ctx) => {
      const { card, before } = await tasksService(ctx).updateCard(id, patch, {
        expectedVersion,
      });
      const columns = await columnsFor(ctx, [card.board_id]);
      const fields = Object.keys(updateCardSchema.parse(patch)).map(
        (key) => patchColumns[key as keyof typeof patchColumns],
      );
      return {
        ...summarize(card, columns),
        _undo: undoState(before, card, fields),
      };
    },
    undo: undoTask,
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
        _undo: undoState(before, card, [
          "column_id",
          "position",
          "completed_at",
        ]),
        undoPolicy: card.repeat_rule
          ? "완료를 되돌려도 이미 생성된 다음 회차는 유지해요."
          : null,
      };
    },
    undo: undoTask,
  }),
  complete: defineTool({
    description:
      "카드를 완료(Done 컬럼으로 이동) 처리한다. 반복 카드의 완료 Undo는 다음 회차를 유지한다.",
    inputSchema: idSchema,
    risk: "write",
    execute: async ({ id }, ctx) => {
      const { card, before } = await tasksService(ctx).completeCard(id);
      const columns = await columnsFor(ctx, [card.board_id]);
      return {
        ...summarize(card, columns),
        _undo: undoState(before, card, [
          "column_id",
          "position",
          "completed_at",
        ]),
        undoPolicy: card.repeat_rule
          ? "완료를 되돌려도 이미 생성된 다음 회차는 유지해요."
          : null,
      };
    },
    undo: undoTask,
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
      const { cards, remaining } = await tasksService(ctx).bulkUpdate(
        ids,
        patch,
      );
      const columns = await columnsFor(
        ctx,
        cards.map((c) => c.board_id),
      );
      return {
        count: cards.length,
        remaining,
        status: remaining.length ? "partial" : "completed",
        cards: cards.map((c) => summarize(c, columns)),
      };
    },
  }),
  schedule: defineTool({
    description:
      "할 일에 작업 시간을 잡는다. 마감을 유지하며 기존 블록 재시도는 재사용한다. 충돌은 실행 직전 검사한다.",
    inputSchema: scheduleSchema,
    risk: "write",
    execute: async (input, ctx) => scheduleTaskResult(ctx, input),
  }),
  reschedule: defineTool({
    description:
      "할 일의 연결된 작업 시간만 이동한다. 마감과 계획 날짜는 유지하며 겹치는 시간은 거절한다.",
    inputSchema: scheduleSchema,
    risk: "write",
    execute: async (input, ctx) => scheduleTaskResult(ctx, input, true),
  }),
  unschedule: defineTool({
    description:
      "할 일 작업 시간 블록을 취소하고 링크를 정리한다. 할 일과 마감은 유지한다.",
    inputSchema: z.object({
      cardId: z.string().uuid(),
      expectedVersion: z.string().optional(),
    }),
    risk: "write",
    execute: async ({ cardId, expectedVersion }, ctx) =>
      unscheduleTask(ctx, cardId, expectedVersion),
  }),
  plan: defineTool({
    description:
      "선택한 할 일의 계획 날짜만 일괄 변경한다. planDate=null은 계획에서 빼기이며 마감은 유지한다. 부분 실패 시 remaining을 보고한다.",
    inputSchema: planCardsSchema,
    risk: "write",
    execute: async ({ items, planDate }, ctx) =>
      tasksService(ctx).planCards(items, planDate),
  }),
  archive: defineTool({
    description: "카드를 보관(보드에서 숨김)한다. 삭제와 달리 되돌릴 수 있다.",
    inputSchema: idSchema,
    risk: "write",
    execute: async ({ id }, ctx) => {
      const svc = tasksService(ctx);
      const before = await svc.getCard(id);
      if (!before) throw new Error("카드를 찾을 수 없어요");
      const card = await svc.archiveCard(id, true, before.updated_at);
      return {
        id: card.id,
        title: card.title,
        version: card.updated_at,
        changed: before.archived_at !== card.archived_at,
        _undo: undoState(before, card, ["archived_at"]),
      };
    },
    undo: undoTask,
  }),
  restore: defineTool({
    description:
      "보관한 카드를 기존 ID 그대로 복원한다. state=archived 목록으로 먼저 찾는다.",
    inputSchema: idSchema,
    risk: "write",
    execute: async ({ id }, ctx) => {
      const svc = tasksService(ctx);
      const before = await svc.getCard(id);
      if (!before) throw new Error("카드를 찾을 수 없어요");
      const card = await svc.archiveCard(id, false, before.updated_at);
      return {
        ...summarize(card, await columnsFor(ctx, [card.board_id])),
        changed: before.archived_at !== card.archived_at,
        _undo: undoState(before, card, ["archived_at"]),
      };
    },
    undo: undoTask,
  }),
  delete: defineTool({
    description:
      "카드를 영구 삭제한다. 되돌릴 수 없다. 보관(archive)으로 충분하면 그쪽을 먼저 권한다.",
    inputSchema: idSchema.extend({ expectedVersion: z.string().optional() }),
    risk: "destructive",
    execute: async ({ id, expectedVersion }, ctx) => {
      const card = await tasksService(ctx).deleteCard(
        id,
        ctx.approvedVersions?.[`cards:${id}`] ?? expectedVersion,
      );
      return { id: card.id, title: card.title };
    },
  }),
};
