import type { ServiceContext } from "@/core/contracts";
import type { Json } from "@/core/db/types.generated";
import type { TranscriptTurn } from "@/core/transcription";
import { buildKeywords } from "./hints";
import {
  type MeetingRow,
  meetingsRepository,
  type SegmentRow,
} from "./repository";
import { MEETING_EVENTS, startMeetingSchema } from "./schema";

export function meetingsService(ctx: ServiceContext) {
  const repo = meetingsRepository(ctx.db, ctx.userId);

  async function start(raw: {
    title?: string;
    calendarEventId?: string;
    audioMime?: string;
  }): Promise<MeetingRow> {
    const input = startMeetingSchema.parse(raw);
    const keywords = await buildKeywords(ctx, input.calendarEventId);
    const title =
      input.title ??
      (await titleFromEvent(input.calendarEventId)) ??
      `회의 ${new Intl.DateTimeFormat("ko-KR", { timeZone: ctx.timezone, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(ctx.now)}`;
    const meeting = await repo.insert({
      title,
      calendar_event_id: input.calendarEventId ?? null,
      keywords,
      audio_mime: input.audioMime ?? null,
      audio_local_key: null,
    });
    await repo.update(meeting.id, { audio_local_key: `rec:${meeting.id}` });
    await ctx.emit({
      type: MEETING_EVENTS.started,
      entity: { type: "meeting", id: meeting.id },
      payload: { title },
    });
    return { ...meeting, audio_local_key: `rec:${meeting.id}` };
  }

  async function titleFromEvent(id?: string): Promise<string | null> {
    if (!id) return null;
    const { data } = await ctx.db
      .from("calendar_events")
      .select("title")
      .eq("id", id)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    return data?.title ?? null;
  }

  /** 라이브 패스: 세그먼트의 turn 들을 회의 시간 기준으로 저장 */
  async function appendLiveTurns(
    meetingId: string,
    seq: number,
    startMs: number,
    turns: TranscriptTurn[],
    raw?: unknown,
  ): Promise<SegmentRow[]> {
    const rows = turns.length
      ? turns.map((t) => ({
          meeting_id: meetingId,
          pass: "live" as const,
          seq,
          turn_id: t.turnId,
          start_ms: startMs + t.startMs,
          end_ms: startMs + t.endMs,
          text: t.text,
          status: "ok" as const,
          raw: raw as Json,
        }))
      : [];
    return repo.insertSegments(rows);
  }

  async function markSegmentFailed(
    meetingId: string,
    seq: number,
    startMs: number,
    endMs: number,
    error: string,
  ): Promise<void> {
    await repo.insertSegments([
      {
        meeting_id: meetingId,
        pass: "live",
        seq,
        turn_id: -1,
        start_ms: startMs,
        end_ms: endMs,
        text: "",
        status: "failed",
        raw: { error } as Json,
      },
    ]);
  }

  async function finalize(
    meetingId: string,
    opts: { durationSec: number; skipFinalPass?: boolean },
  ): Promise<MeetingRow> {
    const meeting = await repo.update(meetingId, {
      status: "processing",
      ended_at: ctx.now.toISOString(),
      duration_sec: opts.durationSec,
      final_pass_status: opts.skipFinalPass ? "skipped" : "pending",
    });
    await ctx.emit({
      type: MEETING_EVENTS.ended,
      entity: { type: "meeting", id: meetingId },
      payload: { durationSec: opts.durationSec },
    });
    await ctx.enqueue({
      type: "meetings.postprocess",
      payload: { meetingId, pass: "live" },
      dedupeKey: `meetings.postprocess:${meetingId}:live`,
    });
    return meeting;
  }

  async function bookmark(
    meetingId: string,
    atMs: number,
    note?: string,
  ): Promise<void> {
    const m = await repo.get(meetingId);
    if (!m) throw new Error("회의를 찾을 수 없어요");
    const list = [
      ...((m.bookmarks as Array<{ atMs: number; note?: string }>) ?? []),
      { atMs, note },
    ];
    await repo.update(meetingId, { bookmarks: list as unknown as Json });
  }

  async function setSpeakerName(
    meetingId: string,
    speaker: string,
    name: string,
  ): Promise<void> {
    const m = await repo.get(meetingId);
    if (!m) throw new Error("회의를 찾을 수 없어요");
    const map = {
      ...((m.speaker_map as Record<string, string>) ?? {}),
      [speaker]: name,
    };
    await repo.update(meetingId, { speaker_map: map as unknown as Json });
  }

  /** 화면·요약용 전사: final 이 있으면 final, 없으면 live(ok 만) */
  async function transcript(
    meetingId: string,
  ): Promise<{ pass: "live" | "final"; segments: SegmentRow[] }> {
    const final = await repo.listSegments(meetingId, "final");
    if (final.length > 0) return { pass: "final", segments: final };
    const live = (await repo.listSegments(meetingId, "live")).filter(
      (s) => s.status === "ok",
    );
    return { pass: "live", segments: live };
  }

  async function remove(meetingId: string): Promise<MeetingRow> {
    const m = await repo.get(meetingId);
    if (!m) throw new Error("회의를 찾을 수 없어요");
    await repo.delete(meetingId);
    await ctx.emit({
      type: MEETING_EVENTS.deleted,
      entity: { type: "meeting", id: meetingId },
      payload: { title: m.title },
    });
    return m;
  }

  return {
    start,
    appendLiveTurns,
    markSegmentFailed,
    finalize,
    bookmark,
    setSpeakerName,
    transcript,
    remove,
    get: repo.get,
    list: repo.list,
    listRecent: repo.listRecent,
    maxSeq: repo.maxSeq,
    update: repo.update,
    repo,
  };
}
