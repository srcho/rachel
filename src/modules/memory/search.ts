import { z } from "zod";
import type {
  EventHandler,
  JobHandler,
  ServiceContext,
} from "@/core/contracts";
import type { Json } from "@/core/db/types.generated";
import { llmEmbed } from "@/core/llm/client";

export interface SearchHit {
  id: string;
  sourceType: string;
  sourceId: string;
  title: string;
  href: string | null;
  snippet: string;
  score: number;
  metadata: Record<string, unknown>;
}

/** 소스 하나를 재인덱싱: 인덱서가 청크를 만들고, 임베딩 후 upsert. 사라진 청크는 삭제. */
export async function reindexSource(
  ctx: ServiceContext,
  sourceType: string,
  sourceId: string,
): Promise<number> {
  const indexer = ctx.registry
    .indexers()
    .find((i) => i.sourceType === sourceType);
  if (!indexer) return 0;
  const chunks = await indexer.chunks(sourceId, ctx);
  const rows = [];
  let indexError: unknown;
  for (const c of chunks) {
    const embedding = await llmEmbed({
      db: ctx.db,
      userId: ctx.userId,
      value: c.content,
      feature: "embed",
    })
      .then((r) => r.embedding)
      .catch((error) => {
        indexError = error;
        return null;
      });
    rows.push({
      user_id: ctx.userId,
      source_type: sourceType,
      source_id: sourceId,
      chunk_index: c.index,
      content: c.content,
      embedding: embedding ? JSON.stringify(embedding) : null,
      metadata: (c.metadata ?? {}) as Json,
      updated_at: new Date().toISOString(),
    });
  }
  if (rows.length > 0) {
    const { error } = await ctx.db.from("search_chunks").upsert(rows, {
      onConflict: "user_id,source_type,source_id,chunk_index",
    });
    if (error) throw error;
  }
  const keep = chunks.map((c) => c.index);
  let del = ctx.db
    .from("search_chunks")
    .delete()
    .eq("user_id", ctx.userId)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId);
  if (keep.length > 0)
    del = del.not("chunk_index", "in", `(${keep.join(",")})`);
  const { error } = await del;
  if (error) throw error;
  const firstRow = rows[0];
  if (sourceType === "memory" && firstRow) {
    const { error: memoryError } = await ctx.db
      .from("memories")
      .update({
        embedding: firstRow.embedding,
        index_status: indexError ? "pending" : "ready",
      })
      .eq("id", sourceId)
      .eq("user_id", ctx.userId)
      .eq("content", firstRow.content);
    if (memoryError) throw memoryError;
  }
  // The worker retries embeddings; corrected text is already searchable by keyword.
  if (indexError) throw indexError;
  return rows.length;
}

export async function searchAllWithStatus(
  ctx: ServiceContext,
  query: string,
  opts: { types?: string[]; k?: number } = {},
) {
  const q = query.trim();
  if (!q)
    return {
      hits: [] as SearchHit[],
      status: "semantic" as const,
      notice: null,
    };
  let degraded = false;
  let data: Array<{
    id: string;
    source_type: string;
    source_id: string;
    content: string;
    metadata: Json;
    score: number;
  }>;
  try {
    const { embedding } = await llmEmbed({
      db: ctx.db,
      userId: ctx.userId,
      value: q,
      feature: "embed",
    });
    const result = await ctx.db.rpc("search_chunks_hybrid", {
      p_user_id: ctx.userId,
      p_embedding: JSON.stringify(embedding),
      p_query: q,
      p_k: opts.k ?? 12,
      p_types: opts.types ?? undefined,
    });
    if (result.error) throw result.error;
    data = result.data ?? [];
  } catch {
    degraded = true;
    let request = ctx.db
      .from("search_chunks")
      .select("*")
      .eq("user_id", ctx.userId)
      .ilike("content", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
    if (opts.types?.length) request = request.in("source_type", opts.types);
    const result = await request
      .order("updated_at", { ascending: false })
      .limit(opts.k ?? 12);
    if (result.error) throw result.error;
    data = (result.data ?? []).map((r) => ({ ...r, score: 0 }));
  }
  const hits: SearchHit[] = data.map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      sourceType: r.source_type,
      sourceId: r.source_id,
      title: String(meta.title ?? r.source_type),
      href: typeof meta.href === "string" ? meta.href : null,
      snippet: snippetAround(r.content, q),
      score: Number(r.score),
      metadata: meta,
    };
  });
  return {
    hits,
    status: degraded ? ("keyword_only" as const) : ("semantic" as const),
    notice: degraded
      ? "의미 검색을 사용할 수 없어 키워드로만 검색했어요. 관련 자료가 빠질 수 있어요."
      : null,
  };
}

export async function searchAll(
  ctx: ServiceContext,
  query: string,
  opts: { types?: string[]; k?: number } = {},
): Promise<SearchHit[]> {
  return (await searchAllWithStatus(ctx, query, opts)).hits;
}

function snippetAround(content: string, q: string, width = 140): string {
  const i = content.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return content.slice(0, width).replace(/\n/g, " ");
  const start = Math.max(0, i - width / 3);
  return `${start > 0 ? "…" : ""}${content.slice(start, start + width).replace(/\n/g, " ")}${start + width < content.length ? "…" : ""}`;
}

/** 이벤트 → 인덱싱 잡(소스별 dedupe). 어떤 인덱서가 그 이벤트를 듣는지는 레지스트리가 안다. */
export const indexOnEvent: EventHandler = {
  on: "*",
  handle: async (e, ctx) => {
    const indexers = ctx.registry.indexers(e.type);
    for (const ix of indexers) {
      // calendar.synced 처럼 엔티티가 소스가 아닌 이벤트는 건너뛴다(대량 재인덱싱은 P5 이후)
      if (e.entity.type !== ix.sourceType) continue;
      await ctx.enqueue({
        type: "memory.index",
        payload: { sourceType: ix.sourceType, sourceId: e.entity.id },
        dedupeKey: `memory.index:${ix.sourceType}:${e.entity.id}`,
        runAt: new Date(ctx.now.getTime() + 15_000),
      });
    }
  },
};

export const indexJob: JobHandler<{ sourceType: string; sourceId: string }> = {
  schema: z.object({ sourceType: z.string(), sourceId: z.string() }),
  timeoutSec: 120,
  run: async (p, ctx) => {
    await reindexSource(ctx, p.sourceType, p.sourceId);
  },
};
