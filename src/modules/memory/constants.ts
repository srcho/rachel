// zod 없이 클라이언트에서도 쓰는 상수 (schema.ts 는 zod 를 끌어온다)
export const MEMORY_KINDS = [
  "fact",
  "preference",
  "person",
  "decision",
  "goal",
  "routine",
] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];
