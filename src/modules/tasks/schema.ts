import { z } from "zod";
import { repeatRuleSchema } from "./repeat";

export const DEFAULT_COLUMNS = [
  { name: "Backlog", isDone: false },
  { name: "Todo", isDone: false },
  { name: "Doing", isDone: false },
  { name: "Done", isDone: true },
] as const;

export const cardSourceSchema = z.object({
  type: z
    .enum(["manual", "agent", "meeting", "capture", "google"])
    .default("manual"),
  ref_id: z.string().optional(),
  source_seq: z.array(z.number().int()).optional(),
  source_at_ms: z.array(z.number().nonnegative()).optional(),
});
export type CardSource = z.infer<typeof cardSourceSchema>;

export const checklistItemSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  done: z.boolean().default(false),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const createCardSchema = z.object({
  creationKey: z.string().min(1).max(2000).optional(),
  boardId: z.string().uuid().optional(),
  columnId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(500),
  description: z.string().default(""),
  priority: z.number().int().min(0).max(3).default(2),
  repeatRule: repeatRuleSchema.nullable().optional(),
  planDate: z.string().date().nullable().optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  dueHasTime: z.boolean().default(false),
  labels: z.array(z.string().trim().min(1)).default([]),
  checklist: z.array(checklistItemSchema).default([]),
  source: cardSourceSchema.default({ type: "manual" }),
  calendarEventId: z.string().uuid().nullable().optional(),
  meetingId: z.string().uuid().nullable().optional(),
});
export type CreateCardInput = z.input<typeof createCardSchema>;

export const updateCardSchema = createCardSchema
  .omit({ boardId: true, columnId: true, source: true, creationKey: true })
  .extend({
    description: createCardSchema.shape.description.removeDefault(),
    priority: createCardSchema.shape.priority.removeDefault(),
    dueHasTime: createCardSchema.shape.dueHasTime.removeDefault(),
    labels: createCardSchema.shape.labels.removeDefault(),
    checklist: createCardSchema.shape.checklist.removeDefault(),
  })
  .partial();
export type UpdateCardInput = z.input<typeof updateCardSchema>;

export const moveCardSchema = z.object({
  columnId: z.string().uuid(),
  /** 이 카드 앞에 둘 카드. 없으면 맨 뒤 */
  beforeId: z.string().uuid().nullable().optional(),
  /** 이 카드 뒤에 둘 카드 */
  afterId: z.string().uuid().nullable().optional(),
});
export type MoveCardInput = z.input<typeof moveCardSchema>;

export const listCardsFilterSchema = z.object({
  boardId: z.string().uuid().optional(),
  columnId: z.string().uuid().optional(),
  due: z.enum(["today", "overdue", "week", "none"]).optional(),
  planDate: z.string().date().optional(),
  label: z.string().optional(),
  priority: z.number().int().min(0).max(3).optional(),
  includeCompleted: z.boolean().default(false),
  state: z.enum(["active", "archived", "all"]).default("active"),
  cursor: z.number().int().min(0).default(0),
  q: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(200).default(50),
});
export type ListCardsFilter = z.input<typeof listCardsFilterSchema>;

export const TASK_EVENTS = {
  created: "task.created",
  updated: "task.updated",
  moved: "task.moved",
  completed: "task.completed",
  reopened: "task.reopened",
  archived: "task.archived",
  deleted: "task.deleted",
} as const;

export const planCardsSchema = z.object({
  items: z
    .array(
      z.object({ id: z.string().uuid(), expectedVersion: z.string().min(1) }),
    )
    .min(1)
    .max(100),
  planDate: z.string().date().nullable(),
});
