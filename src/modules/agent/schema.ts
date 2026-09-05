import { z } from "zod";

export const executionListSchema = z.object({
  turnKey: z.string().max(500).optional(),
  threadId: z.string().uuid().optional(),
  status: z.enum(["running", "done", "uncertain"]).optional(),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(20),
});
export const threadListSchema = z.object({
  query: z.string().trim().max(500).default(""),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(20),
});
export const threadReadSchema = z.object({
  id: z.string().uuid(),
  beforeId: z.string().min(1).max(200).optional(),
  limit: z.number().int().min(1).max(200).default(50),
});
