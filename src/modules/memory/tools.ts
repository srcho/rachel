import { z } from "zod";
import { type AnyAgentTool, defineTool } from "@/core/contracts";
import type { MemoryRow } from "./repository";
import { MEMORY_KINDS } from "./schema";
import { searchAllWithStatus } from "./search";
import { type MemoryUndoPatch, memoryService } from "./service";

export const memoryTools: Record<string, AnyAgentTool> = {
  searchAll: defineTool({
    description:
      "할 일·일정·회의 전사/요약·기억을 한 번에 검색한다(의미 + 키워드). '지난번에 예산 얘기', '김민수 관련' 같은 질문에 먼저 쓴다. types 로 범위를 좁힐 수 있다: card, calendar_event, meeting, memory, capture.",
    inputSchema: z.object({
      query: z.string().min(1),
      types: z
        .array(
          z.enum(["card", "calendar_event", "meeting", "memory", "capture"]),
        )
        .optional(),
      k: z.number().int().min(1).max(30).default(10),
    }),
    risk: "read",
    execute: async ({ query, types, k }, ctx) => {
      const result = await searchAllWithStatus(ctx, query, { types, k });
      return {
        status: result.status,
        notice: result.notice,
        hits: result.hits.map((h) => ({
          type: h.sourceType,
          id: h.sourceId,
          title: h.title,
          snippet: h.snippet,
          score: Number(h.score.toFixed(3)),
          href: h.href,
          metadata: h.metadata,
        })),
      };
    },
  }),
  remember: defineTool({
    description:
      "사용자가 '기억해'라고 하거나 앞으로 유용할 선호·사람·결정·목표를 말했을 때 장기 기억으로 저장한다. 한 문장으로. 일정 추천의 오전 회의 회피·기본 길이·시간대 같은 실제 동작 설정은 바꾸지 않는다. 동작 적용 요청은 agent.updatePreferences를 사용한다.",
    inputSchema: z.object({
      creationKey: z.string().min(1).max(2000).optional(),
      content: z.string().min(1).max(300),
      userQuote: z
        .string()
        .min(1)
        .max(300)
        .optional()
        .describe(
          "현재 사용자 메시지에서 직접 인용한 근거. 명시적 기억은 content에도 같은 발언을 그대로 저장하고 3인칭으로 바꾸지 않는다. 추론이면 생략",
        ),
      kind: z.enum(MEMORY_KINDS).default("fact"),
      importance: z.number().int().min(1).max(5).default(3),
    }),
    risk: "write",
    execute: async (input, ctx) => {
      const { userQuote, ...memoryInput } = input;
      const evidence = ctx.latestUserMessage;
      if (userQuote && (!evidence || !evidence.text.includes(userQuote)))
        throw new Error("현재 사용자 발언에서 기억의 근거를 확인할 수 없어요");
      const { memory, merged, createdNow } = await memoryService(ctx).remember({
        ...memoryInput,
        source:
          userQuote && evidence
            ? {
                type: "thread",
                id: evidence.threadId,
                messageId: evidence.id,
                excerpt: userQuote,
                evidence: userQuote.includes(memoryInput.content)
                  ? "explicit_user"
                  : "model_inference",
              }
            : { type: "inference", evidence: "model_inference" },
      });
      return {
        id: memory.id,
        content: memory.content,
        kind: memory.kind,
        merged,
        createdNow,
        operationalSettingsChanged: false,
        ...(memory.kind === "preference"
          ? { nextTool: "agent.updatePreferences" }
          : {}),
        _version: memory.updated_at,
        needsReview: Boolean(memory.review_against),
        confirmedAt: memory.confirmed_at,
        source: memory.source,
        indexStatus: memory.index_status,
      };
    },
    undo: async (output, ctx) => {
      if (output.createdNow)
        await memoryService(ctx).forget(output.id, output._version);
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
    execute: async ({ query, k }, ctx) =>
      memoryService(ctx).recallWithStatus(query, k),
  }),
  list: defineTool({
    description:
      "저장된 기억 목록(유형·검색어·상태로 필터). hasMore이면 nextOffset으로 이어 조회해 전체를 확인한다.",
    inputSchema: z.object({
      kind: z.enum(MEMORY_KINDS).optional(),
      q: z.string().optional(),
      status: z.enum(["active", "archived"]).default("active"),
      limit: z.number().int().min(1).max(200).default(30),
      offset: z.number().int().min(0).default(0),
    }),
    risk: "read",
    execute: async (input, ctx) => {
      const page = await memoryService(ctx).listPage(input);
      return { ...page, items: page.items.map(memoryDetail) };
    },
  }),
  get: defineTool({
    description:
      "기억 내용, 근거 발언, 확인 여부, 원본 버전과 유효 기간을 읽는다.",
    inputSchema: z.object({ id: z.string().uuid() }),
    risk: "read",
    execute: async ({ id }, ctx) =>
      memoryDetail(await memoryService(ctx).get(id)),
  }),
  reviewList: defineTool({
    description:
      "기존 기억과 비교해야 할 새 후보를 조회한다. hasMore이면 nextOffset으로 이어 조회한다.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(200).default(30),
      offset: z.number().int().min(0).default(0),
    }),
    risk: "read",
    execute: async (input, ctx) => {
      const page = await memoryService(ctx).listPage({
        ...input,
        reviewOnly: true,
      });
      return { ...page, items: page.items.map(memoryDetail) };
    },
  }),
  resolveReview: defineTool({
    description:
      "사용자가 비교 후 선택한 기억 검토를 확정한다. replace: 기존 보관 후 새 기억 채택; keep: 둘 다 유지; discard: 새 후보 폐기.",
    inputSchema: z.object({
      id: z.string().uuid(),
      choice: z.enum(["replace", "keep", "discard"]),
    }),
    risk: "write",
    execute: async ({ id, choice }, ctx) => {
      const result = await memoryService(ctx).resolveReview(id, choice);
      return {
        memory: memoryDetail(result.memory),
        original: memoryDetail(result.original),
      };
    },
  }),
  archive: defineTool({
    description: "기억을 보관하여 현재 응답에서 제외한다.",
    inputSchema: z.object({ id: z.string().uuid() }),
    risk: "write",
    execute: async ({ id }, ctx) =>
      memoryDetail(await memoryService(ctx).update(id, { status: "archived" })),
  }),
  restore: defineTool({
    description:
      "보관한 기억을 원래 ID로 복원한다. 원본 변경으로 무효화된 기억은 다시 확인해야 한다.",
    inputSchema: z.object({ id: z.string().uuid() }),
    risk: "write",
    execute: async ({ id }, ctx) =>
      memoryDetail(await memoryService(ctx).update(id, { status: "active" })),
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
      const m = await memoryService(ctx).update(id, patch, before.updated_at);
      const undo: MemoryUndoPatch = {};
      if (patch.content !== undefined) {
        undo.content = before.content;
        undo.source = before.source;
        undo.confirmed_at = before.confirmed_at;
        undo.embedding = before.embedding;
        undo.index_status = before.index_status;
      }
      if (patch.kind !== undefined) undo.kind = before.kind;
      if (patch.importance !== undefined) undo.importance = before.importance;
      if (patch.pinned !== undefined) undo.pinned = before.pinned;
      return {
        id: m.id,
        content: m.content,
        kind: m.kind,
        _before: undo,
        _version: m.updated_at,
      };
    },
    undo: async (output, ctx) => {
      await memoryService(ctx).undoUpdate(
        output.id,
        output._before,
        output._version,
      );
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

function memoryDetail(memory: MemoryRow | null) {
  if (!memory) return null;
  return {
    id: memory.id,
    content: memory.content,
    kind: memory.kind,
    importance: memory.importance,
    pinned: memory.pinned,
    status: memory.status,
    source: memory.source,
    confirmedAt: memory.confirmed_at,
    reviewAgainst: memory.review_against,
    validFrom: memory.valid_from,
    validUntil: memory.valid_until,
    invalidatedAt: memory.invalidated_at,
    indexStatus: memory.index_status,
    updatedAt: memory.updated_at,
    href: `/memory?id=${memory.id}#memory-${memory.id}`,
  };
}
