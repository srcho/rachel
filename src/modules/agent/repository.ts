import type { Db } from "@/core/contracts";
import type { Database, Json } from "@/core/db/types.generated";

export type ThreadRow = Database["public"]["Tables"]["chat_threads"]["Row"];
export type MessageRow = Database["public"]["Tables"]["chat_messages"]["Row"];

export function agentRepository(db: Db, userId: string) {
  const own = <T extends { eq: (col: string, val: string) => T }>(q: T) =>
    q.eq("user_id", userId);
  return {
    async listThreads(limit = 20): Promise<ThreadRow[]> {
      const { data, error } = await own(db.from("chat_threads").select("*"))
        .order("last_message_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
    async getThread(id: string): Promise<ThreadRow | null> {
      const { data, error } = await own(db.from("chat_threads").select("*"))
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async createThread(input: {
      id?: string;
      title?: string | null;
      scope?: Json | null;
    }): Promise<ThreadRow> {
      const { data, error } = await db
        .from("chat_threads")
        .insert({
          ...(input.id && { id: input.id }),
          user_id: userId,
          title: input.title ?? null,
          scope: input.scope ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    async updateThread(
      id: string,
      patch: Partial<
        Pick<
          ThreadRow,
          "title" | "summary" | "summary_upto_message_id" | "last_message_at"
        >
      >,
    ): Promise<void> {
      const { error } = await own(db.from("chat_threads").update(patch)).eq(
        "id",
        id,
      );
      if (error) throw error;
    },
    async deleteThread(id: string): Promise<void> {
      const { error } = await own(db.from("chat_threads").delete()).eq(
        "id",
        id,
      );
      if (error) throw error;
    },
    async listMessages(threadId: string, limit = 200): Promise<MessageRow[]> {
      const { data, error } = await own(db.from("chat_messages").select("*"))
        .eq("thread_id", threadId)
        .order("created_at")
        .limit(limit);
      if (error) throw error;
      return data;
    },
    async insertMessages(
      rows: Array<{
        id: string;
        thread_id: string;
        role: string;
        parts: Json;
        tokens?: number | null;
      }>,
    ): Promise<void> {
      if (rows.length === 0) return;
      const { error } = await db.from("chat_messages").upsert(
        rows.map((r) => ({ ...r, user_id: userId })),
        { onConflict: "id" },
      );
      if (error) throw error;
    },
  };
}
