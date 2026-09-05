import type { Db } from "@/core/contracts";
import type { Database, Json } from "@/core/db/types.generated";

export type IntegrationRow =
  Database["public"]["Tables"]["integrations"]["Row"];
export type TaskLinkRow =
  Database["public"]["Tables"]["google_task_links"]["Row"];
export type CalendarRow = Database["public"]["Tables"]["calendars"]["Row"];
export type EventRow = Database["public"]["Tables"]["calendar_events"]["Row"];
export type EventInsert =
  Database["public"]["Tables"]["calendar_events"]["Insert"];
export type EventUpdate =
  Database["public"]["Tables"]["calendar_events"]["Update"];

export const PROVIDER = "google_calendar";

export function calendarRepository(db: Db, userId: string) {
  const own = <T extends { eq: (col: string, val: string) => T }>(q: T) =>
    q.eq("user_id", userId);
  return {
    // ── google_task_links (카드 ↔ Google Tasks) ──
    async getTaskLink(cardId: string): Promise<TaskLinkRow | null> {
      const { data, error } = await own(
        db.from("google_task_links").select("*"),
      )
        .eq("card_id", cardId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async countTaskLinks(): Promise<number> {
      const { count, error } = await own(
        db
          .from("google_task_links")
          .select("id", { count: "exact", head: true }),
      );
      if (error) throw error;
      return count ?? 0;
    },
    async listTaskLinks(): Promise<TaskLinkRow[]> {
      const { data, error } = await own(
        db.from("google_task_links").select("*"),
      );
      if (error) throw error;
      return data ?? [];
    },
    async upsertTaskLink(row: {
      card_id: string;
      tasklist_id: string;
      gtask_id: string;
      last_pushed_at?: string | null;
      last_pulled_at?: string | null;
    }): Promise<void> {
      const { error } = await db
        .from("google_task_links")
        .upsert({ user_id: userId, ...row }, { onConflict: "user_id,card_id" });
      if (error) throw error;
    },
    async deleteTaskLink(cardId: string): Promise<void> {
      const { error } = await own(db.from("google_task_links").delete()).eq(
        "card_id",
        cardId,
      );
      if (error) throw error;
    },
    // ── integrations ──
    async getIntegration(): Promise<IntegrationRow | null> {
      const { data, error } = await own(db.from("integrations").select("*"))
        .eq("provider", PROVIDER)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async upsertIntegration(patch: {
      account_email: string | null;
      scopes: string[];
      status: string;
      last_error?: string | null;
    }): Promise<IntegrationRow> {
      const { data, error } = await db
        .from("integrations")
        .upsert(
          {
            user_id: userId,
            provider: PROVIDER,
            ...patch,
            last_error: patch.last_error ?? null,
          },
          { onConflict: "user_id,provider" },
        )
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    async updateIntegration(
      id: string,
      patch: Partial<
        Pick<
          IntegrationRow,
          "status" | "last_error" | "last_synced_at" | "sync_cursor"
        >
      >,
    ): Promise<void> {
      const { error } = await own(db.from("integrations").update(patch)).eq(
        "id",
        id,
      );
      if (error) throw error;
    },
    async deleteIntegration(id: string): Promise<void> {
      const { error } = await own(db.from("integrations").delete()).eq(
        "id",
        id,
      );
      if (error) throw error;
    },
    async setSecret(integrationId: string, secret: string): Promise<void> {
      const { error } = await db.rpc("integration_secret_set", {
        p_integration_id: integrationId,
        p_secret: secret,
      });
      if (error) throw error;
    },
    async getSecret(integrationId: string): Promise<string | null> {
      const { data, error } = await db.rpc("integration_secret_get", {
        p_integration_id: integrationId,
      });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
    async deleteSecret(integrationId: string): Promise<void> {
      const { error } = await db.rpc("integration_secret_delete", {
        p_integration_id: integrationId,
      });
      if (error) throw error;
    },
    // ── calendars ──
    async listCalendars(onlySelected = false): Promise<CalendarRow[]> {
      let q = own(db.from("calendars").select("*"));
      if (onlySelected) q = q.eq("selected", true);
      const { data, error } = await q
        .order("is_primary", { ascending: false })
        .order("name");
      if (error) throw error;
      return data;
    },
    async getCalendar(id: string): Promise<CalendarRow | null> {
      const { data, error } = await own(db.from("calendars").select("*"))
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async upsertCalendars(
      rows: Array<{
        integration_id: string;
        external_id: string;
        name: string;
        color: string | null;
        is_primary: boolean;
        writable: boolean;
        selected?: boolean;
      }>,
    ): Promise<CalendarRow[]> {
      const { data, error } = await db
        .from("calendars")
        .upsert(
          rows.map((r) => ({ ...r, user_id: userId })),
          { onConflict: "integration_id,external_id", ignoreDuplicates: false },
        )
        .select("*");
      if (error) throw error;
      return data;
    },
    async updateCalendar(
      id: string,
      patch: Partial<
        Pick<
          CalendarRow,
          | "selected"
          | "sync_token"
          | "last_synced_at"
          | "name"
          | "color"
          | "sync_coverage_from"
          | "sync_coverage_to"
        >
      >,
    ): Promise<void> {
      const { error } = await own(db.from("calendars").update(patch)).eq(
        "id",
        id,
      );
      if (error) throw error;
    },
    // ── events ──
    async listEvents(
      range: { from: string; to: string },
      opts: {
        calendarIds?: string[];
        limit?: number;
        offset?: number;
        q?: string;
        after?: { startAt: string; id: string };
      } = {},
    ): Promise<EventRow[]> {
      let q = own(db.from("calendar_events").select("*"))
        .is("deleted_at", null)
        .lt("start_at", range.to)
        .gt("end_at", range.from);
      if (opts.calendarIds) q = q.in("calendar_id", opts.calendarIds);
      if (opts.q) {
        const term = `%${opts.q.replace(/[\\%_]/g, "\\$&")}%`;
        q = q.or(
          `title.ilike.${JSON.stringify(term)},location.ilike.${JSON.stringify(term)},description.ilike.${JSON.stringify(term)}`,
        );
      }
      if (opts.after)
        q = q.or(
          `start_at.gt.${opts.after.startAt},and(start_at.eq.${opts.after.startAt},id.gt.${opts.after.id})`,
        );
      const { data, error } = await q
        .order("start_at")
        .order("id")
        .range(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 500) - 1);
      if (error) throw error;
      return data;
    },
    async getEvent(id: string): Promise<EventRow | null> {
      const { data, error } = await own(db.from("calendar_events").select("*"))
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async findByExternal(
      calendarId: string,
      externalId: string,
    ): Promise<EventRow | null> {
      const { data, error } = await own(db.from("calendar_events").select("*"))
        .eq("calendar_id", calendarId)
        .eq("external_id", externalId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async upsertEvents(
      rows: Array<Omit<EventInsert, "user_id">>,
    ): Promise<number> {
      if (rows.length === 0) return 0;
      const { data, error } = await db.rpc("merge_calendar_events", {
        p_rows: rows as Json,
        p_user_id: userId,
      });
      if (error) throw error;
      return data;
    },
    async findCreated(key: string): Promise<EventRow | null> {
      const { data, error } = await own(db.from("calendar_events").select("*"))
        .eq("creation_key", key)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async insertEvent(row: Omit<EventInsert, "user_id">): Promise<EventRow> {
      const { data, error } = await db
        .from("calendar_events")
        .insert({ ...row, user_id: userId })
        .select("*")
        .single();
      if (error?.code === "23505" && row.creation_key) {
        const { data: existing, error: lookupError } = await own(
          db.from("calendar_events").select("*"),
        )
          .eq("creation_key", row.creation_key)
          .maybeSingle();
        if (lookupError) throw lookupError;
        if (existing) return existing;
      }
      if (error) throw error;
      return data;
    },
    async writeEvent(
      patch: EventUpdate,
      id?: string,
      expectedVersion?: string,
      preventOverlap = false,
    ): Promise<EventRow & { createdNow: boolean }> {
      const { data, error } = await db.rpc("write_calendar_event", {
        p_user_id: userId,
        p_patch: patch as Json,
        p_id: id,
        p_expected_version: expectedVersion,
        p_prevent_overlap: preventOverlap,
      });
      if (error?.code === "40001")
        throw new Error("일정이 변경됐어요. 최신 내용을 확인해 주세요.");
      if (error) throw error;
      const result = data as {
        event?: EventRow;
        conflicts?: EventRow[];
        createdNow?: boolean;
      };
      if (result.conflicts) throw new CalendarOverlapError(result.conflicts);
      if (!result.event) throw new Error("일정을 저장하지 못했어요");
      return { ...result.event, createdNow: result.createdNow === true };
    },
    async updateEvent(id: string, patch: EventUpdate): Promise<EventRow> {
      const { data, error } = await own(
        db.from("calendar_events").update(patch),
      )
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    async finishPush(
      id: string,
      version: string,
      patch: EventUpdate,
      rejectIfChanged = false,
    ): Promise<EventRow> {
      const { data, error } = await own(
        db.from("calendar_events").update(patch),
      )
        .eq("id", id)
        .eq("updated_at", version)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (data) return data;
      if (rejectIfChanged)
        throw new Error("일정이 변경됐어요. 최신 내용을 확인해 주세요.");
      const latest = await own(db.from("calendar_events").select("*"))
        .eq("id", id)
        .single();
      if (latest.error) throw latest.error;
      return latest.data;
    },
    async listPending(): Promise<EventRow[]> {
      const { data, error } = await own(db.from("calendar_events").select("*"))
        .eq("sync_status", "pending_push")
        .limit(50);
      if (error) throw error;
      return data;
    },
  };
}

export type CalendarRepository = ReturnType<typeof calendarRepository>;
export type { Json };

export class CalendarOverlapError extends Error {
  readonly code = "CALENDAR_OVERLAP";
  constructor(public readonly conflicts: EventRow[]) {
    super("다른 일정과 겹쳐요. 새 시간을 선택해 주세요.");
  }
}
