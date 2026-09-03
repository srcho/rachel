import { z } from "zod";
import { type AnyAgentTool, defineTool } from "@/core/contracts";
import { MEMORY_KINDS } from "./schema";
import { memoryService } from "./service";

export const memoryTools: Record<string, AnyAgentTool> = {
  remember: defineTool({
    description:
      "사용자가 '기억해'라고 하거나 앞으로 유용할 선호·사람·결정·목표를 말했을 때 저장한다. 한 문장으로.",
    inputSchema: z.object({
      content: z.string().min(1).max(300),
      kind: z.enum(MEMORY_KINDS).default("fact"),
      importance: z.number().int().min(1).max(5).default(3),
    }),
    risk: "write",
    execute: async (input, ctx) => {
      const { memory, merged } = await memoryService(ctx).remember({
        ...input,
        source: { type: "manual" },
      });
      return {
        id: memory.id,
        content: memory.content,
        kind: memory.kind,
        merged,
      };
    },
    undo: async (output, ctx) => {
      if (!output.merged) await memoryService(ctx).forget(output.id);
    },
  }),
  recall: defineTool({
    description:
      "질문과 관련된 기억을 찾는다. 사용자가 과거에 말한 선호·사람·결정을 물을 때.",
    inputSchema: z.object({
      query: z.string().min(1),
      k: z.number().int().min(1).max(20).default(8),
    }),
    risk: "read",
    execute: async ({ query, k }, ctx) => memoryService(ctx).recall(query, k),
  }),
  list: defineTool({
    description: "저장된 기억 목록(유형·검색어로 필터).",
    inputSchema: z.object({
      kind: z.enum(MEMORY_KINDS).optional(),
      q: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(30),
    }),
    risk: "read",
    execute: async (input, ctx) =>
      (await memoryService(ctx).list(input)).map((m) => ({
        id: m.id,
        kind: m.kind,
        content: m.content,
        importance: m.importance,
        pinned: m.pinned,
      })),
  }),
  update: defineTool({
    description: "기억의 내용·유형·중요도·고정 여부를 고친다.",
    inputSchema: z.object({
      id: z.string().uuid(),
      content: z.string().min(1).max(300).optional(),
      kind: z.enum(MEMORY_KINDS).optional(),
      importance: z.number().int().min(1).max(5).optional(),
      pinned: z.boolean().optional(),
    }),
    risk: "write",
    execute: async ({ id, ...patch }, ctx) => {
      const before = await memoryService(ctx).get(id);
      if (!before) throw new Error("기억을 찾을 수 없어요");
      const m = await memoryService(ctx).update(id, patch);
      return {
        id: m.id,
        content: m.content,
        kind: m.kind,
        _before: {
          content: before.content,
          kind: before.kind,
          importance: before.importance,
          pinned: before.pinned,
        },
      };
    },
    undo: async (output, ctx) => {
      await memoryService(ctx).update(output.id, {
        ...output._before,
        kind: output._before.kind as never,
      });
    },
  }),
  forget: defineTool({
    description:
      "기억을 삭제한다. 되돌릴 수 없으니 먼저 어떤 기억인지 확인받는다.",
    inputSchema: z.object({ id: z.string().uuid() }),
    risk: "destructive",
    execute: async ({ id }, ctx) => {
      const before = await memoryService(ctx).forget(id);
      if (!before) throw new Error("기억을 찾을 수 없어요");
      return { id, content: before.content };
    },
  }),
};
