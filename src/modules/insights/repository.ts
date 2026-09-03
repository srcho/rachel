import type { Db } from "@/core/contracts";
import type { Database, Json } from "@/core/db/types.generated";

export type InsightRow = Database["public"]["Tables"]["insights"]["Row"];
export type InsightKind = InsightRow["kind"];

export function insightsRepository(db: Db, userId: string) {
  const own = <T extends { eq: (col: string, val: string) => T }>(q: T) =>
    q.eq("user_id", userId);
  return {
    async get(kind: string, periodStart: string): Promise<InsightRow | null> {
      const { data, error } = await own(db.from("insights").select("*"))
        .eq("kind", kind)
        .eq("period_start", periodStart)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async list(kind: string, limit = 12): Promise<InsightRow[]> {
      const { data, error } = await own(db.from("insights").select("*"))
        .eq("kind", kind)
        .order("period_start", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
    async upsert(row: {
      kind: string;
      period_start: string;
      period_end: string;
      content_md: string;
      data: Json;
      model: string | null;
    }): Promise<InsightRow> {
      const { data, error } = await db
        .from("insights")
        .upsert(
          { ...row, user_id: userId },
          { onConflict: "user_id,kind,period_start" },
        )
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
  };
}
