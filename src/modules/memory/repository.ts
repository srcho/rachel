import type { Db } from "@/core/contracts";
import type { Database, Json } from "@/core/db/types.generated";
import type { MemoryKind } from "./schema";

export type MemoryRow = Database["public"]["Tables"]["memories"]["Row"];
export type MemoryMatch =
  Database["public"]["Functions"]["match_memories"]["Returns"][number];

const toVector = (v: number[]) => JSON.stringify(v);

export function memoryRepository(db: Db, userId: string) {
  const own = <T extends { eq: (col: string, val: string) => T }>(q: T) =>
    q.eq("user_id", userId);
  return {
    async list(
      opts: {
        kind?: MemoryKind;
        q?: string;
        status?: "active" | "archived";
        limit?: number;
      } = {},
    ): Promise<MemoryRow[]> {
      let q = own(db.from("memories").select("*")).eq(
        "status",
        opts.status ?? "active",
      );
      if (opts.kind) q = q.eq("kind", opts.kind);
      if (opts.q) q = q.ilike("content", `%${opts.q}%`);
      const { data, error } = await q
        .order("pinned", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(opts.limit ?? 100);
      if (error) throw error;
      return data;
    },
    async get(id: string): Promise<MemoryRow | null> {
      const { data, error } = await own(db.from("memories").select("*"))
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async pinned(): Promise<MemoryRow[]> {
      const { data, error } = await own(db.from("memories").select("*"))
        .eq("status", "active")
        .eq("pinned", true)
        .limit(20);
      if (error) throw error;
      return data;
    },
    async insert(row: {
      kind: MemoryKind;
      content: string;
      embedding: number[] | null;
      importance: number;
      source: Json;
    }): Promise<MemoryRow> {
      const { data, error } = await db
        .from("memories")
        .insert({
          user_id: userId,
          kind: row.kind,
          content: row.content,
          embedding: row.embedding ? toVector(row.embedding) : null,
          importance: row.importance,
          source: row.source,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    async update(
      id: string,
      patch: {
        content?: string;
        embedding?: number[];
        importance?: number;
        kind?: MemoryKind;
        source?: Json;
        pinned?: boolean;
        status?: "active" | "archived";
      },
    ): Promise<MemoryRow> {
      const { embedding, ...rest } = patch;
      const { data, error } = await own(
        db.from("memories").update({
          ...rest,
          ...(embedding && { embedding: toVector(embedding) }),
        }),
      )
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    async delete(id: string): Promise<void> {
      const { error } = await own(db.from("memories").delete()).eq("id", id);
      if (error) throw error;
    },
    async match(
      embedding: number[],
      k = 8,
      minSimilarity = 0.3,
    ): Promise<MemoryMatch[]> {
      const { data, error } = await db.rpc("match_memories", {
        p_user_id: userId,
        p_embedding: toVector(embedding),
        p_k: k,
        p_min_similarity: minSimilarity,
      });
      if (error) throw error;
      return data ?? [];
    },
    /** 답변에 쓰인 기억의 사용 기록(실패는 무시) */
    async touch(ids: string[]): Promise<void> {
      if (ids.length === 0) return;
      const { data } = await own(
        db.from("memories").select("id, use_count"),
      ).in("id", ids);
      await Promise.all(
        (data ?? []).map((m) =>
          own(
            db.from("memories").update({
              use_count: m.use_count + 1,
              last_used_at: new Date().toISOString(),
            }),
          ).eq("id", m.id),
        ),
      );
    },
  };
}
