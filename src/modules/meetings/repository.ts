import type { Db } from "@/core/contracts";
import type { Database, Json } from "@/core/db/types.generated";
import { canonicalSummaryMarkdown } from "./content";

export type MeetingRow = Database["public"]["Tables"]["meetings"]["Row"];
export type MeetingUpdate = Database["public"]["Tables"]["meetings"]["Update"];
export type SegmentRow =
  Database["public"]["Tables"]["transcript_segments"]["Row"];
export type SegmentInsert =
  Database["public"]["Tables"]["transcript_segments"]["Insert"];

export function meetingsRepository(db: Db, userId: string) {
  const canonical = (m: MeetingRow): MeetingRow => ({
    ...m,
    summary_md: canonicalSummaryMarkdown(m.summary, m.summary_md),
  });
  const own = <T extends { eq: (col: string, val: string) => T }>(q: T) =>
    q.eq("user_id", userId);
  return {
    async list(limit = 50): Promise<MeetingRow[]> {
      const { data, error } = await own(db.from("meetings").select("*"))
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data.map(canonical);
    },
    async listPage({
      query = "",
      page = 1,
      pending = false,
    }: {
      query?: string;
      page?: number;
      pending?: boolean;
    }) {
      const size = 20;
      const { data, error } = await db.rpc("list_meeting_records", {
        p_query: query.trim(),
        p_pending: pending,
        p_offset: (page - 1) * size,
      });
      if (error) throw error;
      return {
        meetings: data.map((r) => ({
          ...canonical(r.meeting as unknown as MeetingRow),
          pending_count: r.pending_count,
        })),
        total: data[0]?.total_count ?? 0,
        page,
        size,
      };
    },
    async get(id: string): Promise<MeetingRow | null> {
      const { data, error } = await own(db.from("meetings").select("*"))
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? canonical(data) : null;
    },
    async insert(row: {
      title: string;
      calendar_event_id: string | null;
      keywords: string[];
      audio_mime: string | null;
      audio_local_key: string | null;
    }): Promise<MeetingRow> {
      const { data, error } = await db
        .from("meetings")
        .insert({ ...row, user_id: userId })
        .select("*")
        .single();
      if (error) throw error;
      return canonical(data);
    },
    async update(id: string, patch: MeetingUpdate): Promise<MeetingRow> {
      const { data, error } = await own(db.from("meetings").update(patch))
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return canonical(data);
    },
    async delete(id: string, expectedVersion?: number): Promise<void> {
      let query = own(db.from("meetings").delete()).eq("id", id);
      if (expectedVersion !== undefined)
        query = query.eq("content_version", expectedVersion);
      const { data, error } = await query.select("id");
      if (error) throw error;
      if (!data.length) throw new Error("회의가 변경되었거나 이미 삭제됐어요");
    },
    async listSegments(
      meetingId: string,
      pass?: "live" | "final",
    ): Promise<SegmentRow[]> {
      let q = own(db.from("transcript_segments").select("*")).eq(
        "meeting_id",
        meetingId,
      );
      if (pass) q = q.eq("pass", pass);
      const rows: SegmentRow[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await q
          .order("start_ms")
          .order("seq")
          .order("turn_id")
          .order("id")
          .range(offset, offset + 999);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 1000) return rows;
      }
    },
    async maxSeq(meetingId: string): Promise<number> {
      const { data, error } = await own(
        db.from("transcript_segments").select("seq"),
      )
        .eq("meeting_id", meetingId)
        .eq("pass", "live")
        .order("seq", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.seq ?? -1;
    },
    async insertSegments(
      rows: Array<Omit<SegmentInsert, "user_id">>,
    ): Promise<SegmentRow[]> {
      if (rows.length === 0) return [];
      const { data, error } = await db
        .from("transcript_segments")
        .upsert(
          rows.map((r) => ({ ...r, user_id: userId })),
          {
            onConflict: "meeting_id,pass,seq,turn_id",
            ignoreDuplicates: false,
          },
        )
        .select("*");
      if (error) throw error;
      return data;
    },
    async replaceFinalChunk(
      meetingId: string,
      chunkIndex: number,
      turns: Array<
        Pick<
          SegmentInsert,
          "turn_id" | "start_ms" | "end_ms" | "raw_speaker" | "text"
        >
      >,
    ): Promise<SegmentRow[]> {
      const { data, error } = await db.rpc("replace_final_transcript_chunk", {
        p_meeting_id: meetingId,
        p_chunk_index: chunkIndex,
        p_turns: turns as Json,
      });
      if (error) throw error;
      return data;
    },
    async deleteSegments(
      meetingId: string,
      pass: "live" | "final",
      chunkIndex?: number,
    ): Promise<void> {
      let q = own(db.from("transcript_segments").delete())
        .eq("meeting_id", meetingId)
        .eq("pass", pass);
      if (chunkIndex !== undefined) q = q.eq("chunk_index", chunkIndex);
      const { error } = await q;
      if (error) throw error;
    },
    async updateSpeakers(
      meetingId: string,
      mapping: Array<{
        chunkIndex: number;
        rawSpeaker: string;
        speaker: string;
      }>,
    ): Promise<void> {
      for (const m of mapping) {
        const { error } = await own(
          db.from("transcript_segments").update({ speaker: m.speaker }),
        )
          .eq("meeting_id", meetingId)
          .eq("pass", "final")
          .eq("chunk_index", m.chunkIndex)
          .eq("raw_speaker", m.rawSpeaker);
        if (error) throw error;
      }
    },
    async listRecent(limit = 5): Promise<MeetingRow[]> {
      const { data, error } = await own(db.from("meetings").select("*"))
        .neq("status", "recording")
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data.map(canonical);
    },
  };
}
export type { Json };
