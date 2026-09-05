import type { Db } from "@/core/contracts";
import type { Database, Json } from "@/core/db/types.generated";

export type BoardRow = Database["public"]["Tables"]["boards"]["Row"];
export type ColumnRow = Database["public"]["Tables"]["board_columns"]["Row"];
export type CardRow = Database["public"]["Tables"]["cards"]["Row"];
export type CardInsert = Database["public"]["Tables"]["cards"]["Insert"];
export type CardUpdate = Database["public"]["Tables"]["cards"]["Update"];

/**
 * tasks 모듈의 유일한 DB 접근점. 모든 쿼리는 userId 로 스코프한다
 * (RLS 가 있어도 service-role 경로를 위해 명시한다).
 */
export function tasksRepository(db: Db, userId: string) {
  const own = <T extends { eq: (col: string, val: string) => T }>(q: T) =>
    q.eq("user_id", userId);

  return {
    async findDefaultBoard(): Promise<BoardRow | null> {
      const { data, error } = await own(db.from("boards").select("*"))
        .eq("is_default", true)
        .is("archived_at", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async listBoards(): Promise<BoardRow[]> {
      const { data, error } = await own(db.from("boards").select("*"))
        .is("archived_at", null)
        .order("position");
      if (error) throw error;
      return data;
    },
    async getBoard(id: string): Promise<BoardRow | null> {
      const { data, error } = await own(db.from("boards").select("*"))
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async insertBoard(input: {
      name: string;
      position: string;
      is_default: boolean;
    }): Promise<BoardRow> {
      const { data, error } = await db
        .from("boards")
        .insert({ ...input, user_id: userId })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    async listColumns(boardId: string): Promise<ColumnRow[]> {
      const { data, error } = await own(db.from("board_columns").select("*"))
        .eq("board_id", boardId)
        .order("position");
      if (error) throw error;
      return data;
    },
    async getColumn(id: string): Promise<ColumnRow | null> {
      const { data, error } = await own(db.from("board_columns").select("*"))
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async insertColumns(
      rows: Array<{
        board_id: string;
        name: string;
        position: string;
        is_done: boolean;
      }>,
    ): Promise<ColumnRow[]> {
      const { data, error } = await db
        .from("board_columns")
        .insert(rows.map((r) => ({ ...r, user_id: userId })))
        .select("*");
      if (error) throw error;
      return data;
    },
    async updateColumn(
      id: string,
      patch: Partial<
        Pick<ColumnRow, "name" | "position" | "wip_limit" | "is_done">
      >,
    ): Promise<ColumnRow> {
      const { data, error } = await own(db.from("board_columns").update(patch))
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    async deleteColumn(id: string): Promise<void> {
      const { error } = await own(db.from("board_columns").delete()).eq(
        "id",
        id,
      );
      if (error) throw error;
    },
    async countCardsInColumn(columnId: string): Promise<number> {
      const { count, error } = await own(
        db.from("cards").select("id", { count: "exact", head: true }),
      )
        .eq("column_id", columnId)
        .is("archived_at", null);
      if (error) throw error;
      return count ?? 0;
    },
    async getCard(id: string): Promise<CardRow | null> {
      const { data, error } = await own(db.from("cards").select("*"))
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async getCards(ids: string[]): Promise<CardRow[]> {
      if (ids.length === 0) return [];
      const { data, error } = await own(db.from("cards").select("*")).in(
        "id",
        ids,
      );
      if (error) throw error;
      return data;
    },
    /** 보드의 카드. completedSince 를 주면 그 전에 완료된 카드는 뺀다(오늘 완료만 보이는 Done). */
    async listCardsByBoard(
      boardId: string,
      opts: { completedSince?: string; archived?: boolean } = {},
    ): Promise<CardRow[]> {
      let q = own(db.from("cards").select("*")).eq("board_id", boardId);
      q = opts.archived
        ? q.not("archived_at", "is", null)
        : q.is("archived_at", null);
      if (opts.completedSince)
        q = q.or(
          `completed_at.is.null,completed_at.gte.${opts.completedSince}`,
        );
      const { data, error } = await q.order("position");
      if (error) throw error;
      return data;
    },
    async countCompletedBefore(boardId: string, iso: string): Promise<number> {
      const { count, error } = await own(
        db.from("cards").select("id", { count: "exact", head: true }),
      )
        .eq("board_id", boardId)
        .is("archived_at", null)
        .lt("completed_at", iso);
      if (error) throw error;
      return count ?? 0;
    },
    /** 컬럼 내 마지막 카드(position 최대) */
    async lastCardInColumn(columnId: string): Promise<CardRow | null> {
      const { data, error } = await own(db.from("cards").select("*"))
        .eq("column_id", columnId)
        .is("archived_at", null)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async findCreated(key: string): Promise<CardRow | null> {
      const { data, error } = await own(db.from("cards").select("*"))
        .eq("creation_key", key)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async insertCard(row: Omit<CardInsert, "user_id">): Promise<CardRow> {
      const { data, error } = await db
        .from("cards")
        .insert({ ...row, user_id: userId })
        .select("*")
        .single();
      if (error?.code === "23505" && row.creation_key) {
        const { data: existing, error: lookupError } = await own(
          db.from("cards").select("*"),
        )
          .eq("creation_key", row.creation_key)
          .maybeSingle();
        if (lookupError) throw lookupError;
        if (existing) return existing;
      }
      if (error) throw error;
      return data;
    },
    async updateCard(id: string, patch: CardUpdate): Promise<CardRow> {
      const { data, error } = await own(db.from("cards").update(patch))
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    async updateCards(ids: string[], patch: CardUpdate): Promise<CardRow[]> {
      if (ids.length === 0) return [];
      const { data, error } = await own(db.from("cards").update(patch))
        .in("id", ids)
        .select("*");
      if (error) throw error;
      return data;
    },
    async deleteCard(id: string): Promise<void> {
      const { error } = await own(db.from("cards").delete()).eq("id", id);
      if (error) throw error;
    },
    /** 필터 목록. due 는 timezone 기준 경계를 호출자가 계산해 넘긴다. */
    async queryCards(f: {
      boardId?: string;
      columnId?: string;
      dueFrom?: string;
      dueTo?: string;
      dueIsNull?: boolean;
      planDate?: string;
      label?: string;
      priority?: number;
      includeCompleted: boolean;
      q?: string;
      limit: number;
    }): Promise<CardRow[]> {
      let q = own(db.from("cards").select("*")).is("archived_at", null);
      if (f.boardId) q = q.eq("board_id", f.boardId);
      if (f.columnId) q = q.eq("column_id", f.columnId);
      if (f.planDate) q = q.eq("plan_date", f.planDate);
      if (!f.includeCompleted) q = q.is("completed_at", null);
      if (f.dueIsNull) q = q.is("due_at", null);
      if (f.dueFrom) q = q.gte("due_at", f.dueFrom);
      if (f.dueTo) q = q.lt("due_at", f.dueTo);
      if (f.label) q = q.contains("labels", [f.label]);
      if (f.priority !== undefined) q = q.eq("priority", f.priority);
      if (f.q) q = q.ilike("title", `%${f.q}%`);
      const { data, error } = await q
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("position")
        .limit(f.limit);
      if (error) throw error;
      return data;
    },
  };
}

export type TasksRepository = ReturnType<typeof tasksRepository>;
export type { Json };
