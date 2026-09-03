import { z } from "zod";
import { MEMORY_KINDS, type MemoryKind } from "./constants";

export { MEMORY_KINDS, type MemoryKind };

export const memorySourceSchema = z.object({
  type: z.enum(["thread", "meeting", "capture", "manual"]),
  id: z.string().optional(),
  excerpt: z.string().max(300).optional(),
});
export type MemorySource = z.infer<typeof memorySourceSchema>;

/** 추출 결과 스키마(luna 구조화 출력) */
export const extractedMemoriesSchema = z.object({
  memories: z
    .array(
      z.object({
        kind: z.enum(MEMORY_KINDS),
        content: z
          .string()
          .min(1)
          .max(300)
          .describe("한 문장. 3인칭이 아닌 '사용자는 …' 형태"),
        importance: z.number().int().min(1).max(5).describe("1 사소 … 5 핵심"),
        evidence: z.string().max(200).describe("근거가 된 원문 일부"),
      }),
    )
    .max(10),
});
export type ExtractedMemories = z.infer<typeof extractedMemoriesSchema>;

export const MERGE_SIMILARITY = 0.92;
export const MEMORY_EVENTS = {
  created: "memory.created",
  updated: "memory.updated",
  forgotten: "memory.forgotten",
} as const;
