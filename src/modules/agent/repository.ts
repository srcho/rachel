import type { Db } from "@/core/contracts";
import type { Database, Json } from "@/core/db/types.generated";

export type ThreadRow = Database["public"]["Tables"]["chat_threads"]["Row"];
export type MessageRow = Database["public"]["Tables"]["chat_messages"]["Row"];

/** Saving the approval conversation updates bookkeeping, not the approved thread identity. */
export function threadDeletionVersion(
  thread: Pick<ThreadRow, "created_at" | "title">,
) {
  return JSON.stringify([thread.created_at, thread.title]);
}

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
    async listThreadsPage(input: {
      query: string;
      offset: number;
      limit: number;
    }) {
      const { data, error } = await db.rpc("search_chat_threads", {
        p_query: input.query,
        p_offset: input.offset,
        p_limit: input.limit,
      });
      if (error) throw error;
      const items = data.map((row) => row.thread as unknown as ThreadRow);
      const total = data[0]?.total_count ?? 0;
      const hasMore = input.offset + items.length < total;
      return {
        items,
        total,
        hasMore,
        nextOffset: hasMore ? input.offset + items.length : null,
      };
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
      expectedVersion?: string,
    ): Promise<ThreadRow> {
      let query = own(db.from("chat_threads").update(patch)).eq("id", id);
      if (expectedVersion) query = query.eq("updated_at", expectedVersion);
      const { data, error } = await query.select("*").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("대화가 변경되었거나 찾을 수 없어요");
      return data;
    },
    async deleteThread(
      id: string,
      expectedVersion?: string,
    ): Promise<ThreadRow> {
      let query = own(db.from("chat_threads").delete()).eq("id", id);
      if (expectedVersion) query = query.eq("updated_at", expectedVersion);
      const { data, error } = await query.select("*").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("대화가 변경되었거나 이미 삭제됐어요");
      return data;
    },
    async listMessages(
      threadId: string,
      limit = 200,
      beforeId?: string,
    ): Promise<MessageRow[]> {
      let query = own(db.from("chat_messages").select("*"))
        .eq("thread_id", threadId)
        .order("created_at", { ascending: false })
        .order("message_seq", { ascending: false });
      if (beforeId) {
        const { data: anchor, error } = await own(
          db.from("chat_messages").select("id,created_at,message_seq"),
        )
          .eq("thread_id", threadId)
          .eq("id", beforeId)
          .single();
        if (error) throw error;
        query = query.or(
          `created_at.lt.${anchor.created_at},and(created_at.eq.${anchor.created_at},message_seq.lt.${anchor.message_seq})`,
        );
      }
      const { data, error } = await query.limit(limit);
      if (error) throw error;
      return data.reverse();
    },
    async insertMessages(
      rows: Array<{
        id: string;
        thread_id: string;
        role: string;
        parts: Json;
        metadata?: Json;
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
