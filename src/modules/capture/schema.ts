import { z } from "zod";

export const triageSchema = z.object({
  type: z.enum(["task", "event", "memory", "note"]),
  reason: z.string().max(200),
  task: z
    .object({
      title: z.string().min(1).max(200),
      due: z.string().datetime({ offset: true }).nullable().optional(),
      dueHasTime: z.boolean().optional(),
      priority: z.number().int().min(0).max(3).default(2),
    })
    .optional(),
  event: z
    .object({
      title: z.string().min(1).max(200),
      startAt: z.string().datetime({ offset: true }),
      endAt: z.string().datetime({ offset: true }),
      allDay: z.boolean().default(false),
      location: z.string().optional(),
    })
    .optional(),
  memory: z
    .object({
      kind: z.enum([
        "fact",
        "preference",
        "person",
        "decision",
        "goal",
        "routine",
      ]),
      content: z.string().min(1).max(300),
    })
    .optional(),
});
export type Triage = z.infer<typeof triageSchema>;

// Structured Outputs requires every property to be required; absent proposals use null.
export const triageOutputSchema = triageSchema.extend({
  task: triageSchema.shape.task
    .unwrap()
    .extend({
      due: z.string().datetime({ offset: true }).nullable(),
      dueHasTime: z.boolean(),
      priority: z.number().int().min(0).max(3),
    })
    .nullable(),
  event: triageSchema.shape.event
    .unwrap()
    .extend({
      allDay: z.boolean(),
      location: z.string().nullable(),
    })
    .nullable(),
  memory: triageSchema.shape.memory.unwrap().nullable(),
});

export function normalizeTriage(
  output: z.infer<typeof triageOutputSchema>,
): Triage {
  if (output.type !== "note" && !output[output.type])
    throw new Error("분류 결과가 비어 있어요. 다시 분류해 주세요.");
  return triageSchema.parse({
    type: output.type,
    reason: output.reason,
    task: output.type === "task" ? (output.task ?? undefined) : undefined,
    event:
      output.type === "event" && output.event
        ? { ...output.event, location: output.event.location ?? undefined }
        : undefined,
    memory: output.type === "memory" ? (output.memory ?? undefined) : undefined,
  });
}

export const CAPTURE_EVENTS = {
  added: "capture.added",
  triaged: "capture.triaged",
  resolved: "capture.resolved",
  changed: "capture.changed",
  deleted: "capture.deleted",
} as const;

export const captureListSchema = z.object({
  status: z
    .enum([
      "open",
      "all",
      "inbox",
      "triaged",
      "resolving",
      "resolved",
      "dismissed",
    ])
    .default("open"),
  q: z.string().trim().max(4000).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});
