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
        .is("review_against", null)
        .limit(20);
      if (error) throw error;
      return data;
    },
    async findCreated(key: string): Promise<MemoryRow | null> {
      const { data, error } = await own(db.from("memories").select("*"))
        .eq("creation_key", key)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async insert(row: {
      creation_key?: string;
      review_against?: string;
      confirmed_at?: string;
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
          creation_key: row.creation_key,
          review_against: row.review_against,
          confirmed_at: row.confirmed_at,
          kind: row.kind,
          content: row.content,
          embedding: row.embedding ? toVector(row.embedding) : null,
          importance: row.importance,
          source: row.source,
        })
        .select("*")
        .single();
      if (error?.code === "23505" && row.creation_key) {
        const { data: existing, error: lookupError } = await own(
          db.from("memories").select("*"),
        )
          .eq("creation_key", row.creation_key)
          .maybeSingle();
        if (lookupError) throw lookupError;
        if (existing) return existing;
      }
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
        confirmed_at?: string;
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
        p_k: Math.min(k * 3, 100),
        p_min_similarity: minSimilarity,
      });
      if (error) throw error;
      if (!data?.length) return [];
      const { data: active, error: activeError } = await own(
        db.from("memories").select("id"),
      )
        .in(
          "id",
          data.map((m) => m.id),
        )
        .is("review_against", null);
      if (activeError) throw activeError;
      const allowed = new Set(active?.map((m) => m.id));
      return data.filter((m) => allowed.has(m.id)).slice(0, k);
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
