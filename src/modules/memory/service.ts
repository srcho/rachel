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

export type MemoryUndoPatch = Partial<
  Pick<
    MemoryRow,
    | "content"
    | "kind"
    | "importance"
    | "pinned"
    | "source"
    | "confirmed_at"
    | "embedding"
    | "index_status"
  >
>;

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
    creationKey?: string;
    kind: MemoryKind;
    content: string;
    importance?: number;
    source: MemorySource;
  }): Promise<{ memory: MemoryRow; merged: boolean; createdNow: boolean }> {
    if (input.creationKey) {
      const existing = await repo.findCreated(input.creationKey);
      if (existing)
        return { memory: existing, merged: false, createdNow: false };
    }
    const content = input.content.trim();
    // Persist first-class memory even while the optional vector index is unavailable.
    const source: MemorySource = {
      ...input.source,
      evidence:
        input.source.evidence ??
        (input.source.type === "manual" && ctx.actor === "user"
          ? "explicit_user"
          : "model_inference"),
    };
    const vector = await embed(content).catch(() => null);
    const similar = vector
      ? await repo.match(vector, 3, MERGE_SIMILARITY)
      : await repo.keyword(content, 3);
    const top = similar[0];
    if (top) {
      const existing = await repo.get(top.id);
      if (
        !input.creationKey &&
        existing &&
        existing.content.trim() === content
      ) {
        const memory = await repo.update(existing.id, {
          content:
            content.length > existing.content.length
              ? content
              : existing.content,
          embedding:
            content.length > existing.content.length ? vector : undefined,
          importance: Math.max(existing.importance, input.importance ?? 3),
          source: mergeSources(existing.source, source),
          ...(source.evidence === "explicit_user"
            ? { confirmed_at: ctx.now.toISOString() }
            : {}),
        });
        await ctx.emit({
          type: MEMORY_EVENTS.updated,
          entity: { type: "memory", id: memory.id },
          payload: { merged: true },
        });
        return { memory, merged: true, createdNow: false };
      }
    }
    const candidateId = crypto.randomUUID();
    const memory = await repo.insert({
      id: candidateId,
      creation_key: input.creationKey,
      review_against: top?.id,
      confirmed_at:
        !top && source.evidence === "explicit_user"
          ? ctx.now.toISOString()
          : undefined,
      kind: input.kind,
      content,
      embedding: vector,
      importance: input.importance ?? 3,
      source: source as unknown as Json,
      index_status: vector ? "ready" : "pending",
    });
    const createdNow = memory.id === candidateId;
    if (createdNow)
      await ctx.emit({
        type: MEMORY_EVENTS.created,
        entity: { type: "memory", id: memory.id },
        payload: { kind: input.kind },
      });
    return { memory, merged: false, createdNow };
  }

  async function recallWithStatus(query: string, k = 8) {
    let degraded = false;
    let rows: Array<MemoryRow & { similarity: number }> = [];
    if (query.trim()) {
      try {
        const matches = await repo.match(await embed(query), k, 0.3);
        rows = (
          await Promise.all(
            matches.map(async (m) => {
              const row = await repo.get(m.id);
              return row ? { ...row, similarity: m.similarity } : null;
            }),
          )
        ).filter((m): m is MemoryRow & { similarity: number } => m !== null);
      } catch {
        degraded = true;
        rows = (await repo.keyword(query.trim(), k)).map((m) => ({
          ...m,
          similarity: 0,
        }));
      }
    }
    return {
      status: degraded ? ("keyword_only" as const) : ("semantic" as const),
      notice: degraded
        ? "의미 검색을 사용할 수 없어 키워드로만 찾았어요. 관련 기억이 빠질 수 있어요."
        : null,
      memories: rows.map((m) => ({
        id: m.id,
        kind: m.kind,
        content: m.content,
        similarity: m.similarity,
        pinned: m.pinned,
        updatedAt: m.updated_at,
        confirmedAt: m.confirmed_at,
        source: m.source,
      })),
    };
  }

  async function recall(query: string, k = 8) {
    return (await recallWithStatus(query, k)).memories;
  }

  async function update(
    id: string,
    patch: {
      content?: string;
      kind?: MemoryKind;
      importance?: number;
      pinned?: boolean;
      status?: "active" | "archived";
    },
    expectedVersion?: string,
  ): Promise<MemoryRow> {
    const before = await repo.get(id);
    if (!before) throw new Error("기억을 찾을 수 없어요");
    if (patch.status === "active" && before.invalidated_at)
      throw new Error(
        "원본이 변경된 기억이에요. 내용을 확인하고 새 기억으로 저장해 주세요",
      );
    const embedding = patch.content
      ? await embed(patch.content).catch(() => null)
      : undefined;
    const memory = await repo.update(
      id,
      {
        ...patch,
        embedding,
        ...(patch.status
          ? {
              valid_until:
                patch.status === "archived" ? ctx.now.toISOString() : null,
            }
          : {}),
        ...(patch.content !== undefined
          ? {
              confirmed_at: ctx.actor === "user" ? ctx.now.toISOString() : null,
              source: {
                type: ctx.actor === "user" ? "manual" : "inference",
                evidence:
                  ctx.actor === "user" ? "explicit_user" : "model_inference",
              } as Json,
              index_status: embedding
                ? ("ready" as const)
                : ("pending" as const),
            }
          : {}),
      },
      expectedVersion,
    );
    await ctx.emit({
      type: MEMORY_EVENTS.updated,
      entity: { type: "memory", id },
      payload: { fields: Object.keys(patch) },
    });
    return memory;
  }

  async function undoUpdate(
    id: string,
    patch: MemoryUndoPatch,
    expectedVersion: string,
  ) {
    const { data, error } = await ctx.db
      .from("memories")
      .update(patch)
      .eq("id", id)
      .eq("user_id", ctx.userId)
      .eq("updated_at", expectedVersion)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("기억이 변경됐어요. 다시 확인해 주세요");
    await ctx.emit({
      type: MEMORY_EVENTS.updated,
      entity: { type: "memory", id },
      payload: { fields: Object.keys(patch), undo: true },
    });
    return data;
  }

  async function forget(
    id: string,
    expectedVersion?: string,
  ): Promise<MemoryRow | null> {
    const before = await repo.get(id);
    if (!before) return null;
    await repo.delete(
      id,
      expectedVersion ?? ctx.approvedVersions?.[`memories:${id}`],
    );
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
      if (!m.evidence.trim() || !text.includes(m.evidence.trim())) continue;
      const r = await remember({
        kind: m.kind,
        content: m.content,
        importance: m.importance,
        source: { ...source, excerpt: m.evidence, evidence: "model_inference" },
      });
      if (r.merged) merged++;
      else created++;
    }
    return { created, merged };
  }

  return {
    remember,
    undoUpdate,
    recall,
    recallWithStatus,
    reviewList: async () => repo.list({ reviewOnly: true }),
    resolveReview: async (
      id: string,
      choice: "replace" | "keep" | "discard",
    ) => {
      const before = await repo.get(id);
      if (!before?.review_against)
        throw new Error("검토할 기억을 찾을 수 없어요");
      const { error } = await ctx.db.rpc("resolve_memory_review", {
        p_id: id,
        p_choice: choice,
      });
      if (error) throw error;
      for (const memoryId of [id, before.review_against])
        await ctx.emit({
          type: MEMORY_EVENTS.updated,
          entity: { type: "memory", id: memoryId },
          payload: { review: choice },
        });
      return {
        memory: await repo.get(id),
        original: await repo.get(before.review_against),
      };
    },
    update,
    forget,
    extractFrom,
    list: repo.list,
    listPage: repo.listPage,
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
      (s as MemorySource).id === incoming.id &&
      (s as MemorySource).messageId === incoming.messageId &&
      (s as MemorySource).version === incoming.version &&
      (s as MemorySource).evidence === incoming.evidence,
  );
  return (has ? arr : [...arr, incoming].slice(-5)) as Json;
}
