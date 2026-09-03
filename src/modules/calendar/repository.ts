import type { Db } from "@/core/contracts";
import type { Database, Json } from "@/core/db/types.generated";

export type IntegrationRow =
  Database["public"]["Tables"]["integrations"]["Row"];
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
          "selected" | "sync_token" | "last_synced_at" | "name" | "color"
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
      opts: { calendarIds?: string[]; limit?: number } = {},
    ): Promise<EventRow[]> {
      let q = own(db.from("calendar_events").select("*"))
        .is("deleted_at", null)
        .lt("start_at", range.to)
        .gt("end_at", range.from);
      if (opts.calendarIds) q = q.in("calendar_id", opts.calendarIds);
      const { data, error } = await q
        .order("start_at")
        .limit(opts.limit ?? 500);
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
      const { error, count } = await db.from("calendar_events").upsert(
        rows.map((r) => ({ ...r, user_id: userId })),
        { onConflict: "calendar_id,external_id", count: "exact" },
      );
      if (error) throw error;
      return count ?? rows.length;
    },
    async insertEvent(row: Omit<EventInsert, "user_id">): Promise<EventRow> {
      const { data, error } = await db
        .from("calendar_events")
        .insert({ ...row, user_id: userId })
        .select("*")
        .single();
      if (error) throw error;
      return data;
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
