import { z } from "zod";

export const triageSchema = z.object({
  type: z.enum(["task", "event", "memory", "note"]),
  reason: z.string().max(200),
  task: z
    .object({
      title: z.string().min(1).max(200),
      due: z.string().nullable().optional(),
      dueHasTime: z.boolean().optional(),
      priority: z.number().int().min(0).max(3).default(2),
    })
    .optional(),
  event: z
    .object({
      title: z.string().min(1).max(200),
      startAt: z.string(),
      endAt: z.string(),
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

export const CAPTURE_EVENTS = {
  added: "capture.added",
  triaged: "capture.triaged",
  resolved: "capture.resolved",
} as const;
