import type { ServiceContext } from "@/core/contracts";
import type { Json } from "@/core/db/types.generated";
import { llmEmbed, llmGenerate } from "@/core/llm/client";
import { memoryExtractPrompt } from "@/core/llm/prompts/memory-extract";
import type { UsageRef } from "@/core/llm/usage";
import { type MemoryRow, memoryRepository } from "./repository";
import {
  type ExtractedMemories,
  extractedMemoriesSchema,
  MEMORY_EVENTS,
  MERGE_SIMILARITY,
  type MemoryKind,
  type MemorySource,
} from "./schema";

export type EmbedFn = (text: string, feature?: "embed") => Promise<number[]>;

export function memoryService(
  ctx: ServiceContext,
  deps: { embed?: EmbedFn } = {},
) {
  const repo = memoryRepository(ctx.db, ctx.userId);
  const embed: EmbedFn =
    deps.embed ??
    (async (text) =>
      (await llmEmbed({ db: ctx.db, userId: ctx.userId, value: text }))
        .embedding);

  /** 새 기억을 저장하되, 아주 비슷한 기억이 있으면 병합(갱신)한다. */
  async function remember(input: {
    kind: MemoryKind;
    content: string;
    importance?: number;
    source: MemorySource;
  }): Promise<{ memory: MemoryRow; merged: boolean }> {
    const content = input.content.trim();
    const vector = await embed(content);
    const similar = await repo.match(vector, 3, MERGE_SIMILARITY);
    const top = similar[0];
    if (top) {
      const existing = await repo.get(top.id);
      if (existing) {
        const memory = await repo.update(existing.id, {
          content:
            content.length > existing.content.length
              ? content
              : existing.content,
          embedding:
            content.length > existing.content.length ? vector : undefined,
          importance: Math.max(existing.importance, input.importance ?? 3),
          source: mergeSources(existing.source, input.source),
        });
        await ctx.emit({
          type: MEMORY_EVENTS.updated,
          entity: { type: "memory", id: memory.id },
          payload: { merged: true },
        });
        return { memory, merged: true };
      }
    }
    const memory = await repo.insert({
      kind: input.kind,
      content,
      embedding: vector,
      importance: input.importance ?? 3,
      source: input.source as unknown as Json,
    });
    await ctx.emit({
      type: MEMORY_EVENTS.created,
      entity: { type: "memory", id: memory.id },
      payload: { kind: input.kind },
    });
    return { memory, merged: false };
  }

  async function recall(
    query: string,
    k = 8,
  ): Promise<
    Array<{
      id: string;
      kind: string;
      content: string;
      similarity: number;
      pinned: boolean;
    }>
  > {
    if (!query.trim()) return [];
    const vector = await embed(query);
    const matches = await repo.match(vector, k, 0.3);
    return matches.map((m) => ({
      id: m.id,
      kind: m.kind,
      content: m.content,
      similarity: m.similarity,
      pinned: m.pinned,
    }));
  }

  async function update(
    id: string,
    patch: {
      content?: string;
      kind?: MemoryKind;
      importance?: number;
      pinned?: boolean;
    },
  ): Promise<MemoryRow> {
    const embedding = patch.content ? await embed(patch.content) : undefined;
    const memory = await repo.update(id, { ...patch, embedding });
    await ctx.emit({
      type: MEMORY_EVENTS.updated,
      entity: { type: "memory", id },
      payload: { fields: Object.keys(patch) },
    });
    return memory;
  }

  async function forget(id: string): Promise<MemoryRow | null> {
    const before = await repo.get(id);
    if (!before) return null;
    await repo.delete(id);
    await ctx.emit({
      type: MEMORY_EVENTS.forgotten,
      entity: { type: "memory", id },
      payload: { content: before.content },
    });
    return before;
  }

  /** 텍스트에서 기억 후보를 뽑아 저장. LLM 1회 + 항목당 임베딩 1회. */
  async function extractFrom(
    text: string,
    source: MemorySource,
    ref?: UsageRef,
  ): Promise<{ created: number; merged: number }> {
    if (text.trim().length < 20) return { created: 0, merged: 0 };
    const { output } = await llmGenerate<ExtractedMemories>({
      db: ctx.db,
      userId: ctx.userId,
      role: "extract",
      feature: "extract",
      ref,
      instructions: memoryExtractPrompt(),
      prompt: text.slice(0, 20_000),
      output: extractedMemoriesSchema,
    });
    let created = 0;
    let merged = 0;
    for (const m of output.memories) {
      const r = await remember({
        kind: m.kind,
        content: m.content,
        importance: m.importance,
        source: { ...source, excerpt: m.evidence },
      });
      if (r.merged) merged++;
      else created++;
    }
    return { created, merged };
  }

  return {
    remember,
    recall,
    update,
    forget,
    extractFrom,
    list: repo.list,
    get: repo.get,
    pinned: repo.pinned,
    touch: repo.touch,
  };
}

function mergeSources(existing: Json, incoming: MemorySource): Json {
  const arr = Array.isArray(existing)
    ? existing
    : existing &&
        typeof existing === "object" &&
        Object.keys(existing).length > 0
      ? [existing]
      : [];
  const has = arr.some(
    (s) =>
      typeof s === "object" &&
      s &&
      (s as MemorySource).type === incoming.type &&
      (s as MemorySource).id === incoming.id,
  );
  return (has ? arr : [...arr, incoming].slice(-5)) as Json;
}
