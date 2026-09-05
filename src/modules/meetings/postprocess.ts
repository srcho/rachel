import type { ServiceContext } from "@/core/contracts";
import type { Json } from "@/core/db/types.generated";
import { llmGenerate } from "@/core/llm/client";
import { MODEL_IDS } from "@/core/llm/models";
import { meetingSummaryPrompt } from "@/core/llm/prompts/meeting-summary";
import { meetingChanged } from "./changed";
import { summaryToMarkdown } from "./content";

export { summaryToMarkdown } from "./content";

import { fmtClock } from "./format";
import type { MeetingRow, SegmentRow } from "./repository";
import {
  MEETING_EVENTS,
  type MeetingSummary,
  meetingSummarySchema,
} from "./schema";
import { meetingsService } from "./service";

/** 전사 세그먼트 → LLM 입력 텍스트(타임스탬프·화자·북마크) */
export function assembleTranscript(
  meeting: MeetingRow,
  segments: SegmentRow[],
): string {
  const speakerMap = (meeting.speaker_map as Record<string, string>) ?? {};
  const bookmarks = (
    (meeting.bookmarks as Array<{ atMs: number; note?: string }>) ?? []
  ).map((b) => b.atMs);
  const lines: string[] = [];
  for (const s of segments) {
    if (!s.text.trim()) continue;
    const marked = bookmarks.some(
      (b) => b >= s.start_ms - 30_000 && b <= s.end_ms + 5_000,
    );
    const who = s.speaker
      ? `${speakerMap[s.speaker] ?? `화자 ${s.speaker.replace(/^S/, "")}`}: `
      : "";
    lines.push(
      `[seq=${s.seq}] [${fmtClock(s.start_ms)}]${marked ? " [중요]" : ""} ${who}${s.text.trim()}`,
    );
  }
  return lines.join("\n");
}

/** Accept references only to transcript segments that were actually supplied. */
export function attachSummarySources(
  summary: MeetingSummary,
  segments: SegmentRow[],
): MeetingSummary {
  const refs = (seqs: number[]) => {
    const rows = segments.filter((s) => seqs.includes(s.seq) && s.text.trim());
    return {
      sourceSeq: [...new Set(rows.map((s) => s.seq))],
      sourceAtMs: [...new Set(rows.map((s) => s.start_ms))],
    };
  };
  return {
    ...summary,
    actionItems: summary.actionItems.map((a) => ({
      ...a,
      ...refs(a.sourceSeq),
    })),
    decisionSources: (summary.decisionSources ?? [])
      .filter((d) => d.decisionIndex < summary.decisions.length)
      .map((d) => ({ ...d, ...refs(d.sourceSeq) })),
  };
}

/**
 * 요약 생성. pass='live' 는 종료 직후(빠르게), 'final' 은 화자 분리 후(정확하게).
 * 전사가 너무 짧으면 요약 없이 ready 처리.
 */
export async function postprocessMeeting(
  ctx: ServiceContext,
  meetingId: string,
  pass: "live" | "final",
) {
  const svc = meetingsService(ctx);
  const meeting = await svc.get(meetingId);
  if (!meeting) throw new Error("회의를 찾을 수 없어요");
  if (meeting.note_text !== null)
    return {
      status: "unsupported" as const,
      reason: "manual_note",
      preserved: true,
    };
  const { pass: used, segments } = await svc.transcript(meetingId);
  if (pass === "final" && used !== "final") return; // 파이널 전사가 없으면 건너뜀
  const text = assembleTranscript(meeting, segments);
  if (text.length < 40) {
    await svc.update(meetingId, { status: "ready" });
    return { status: "insufficient_content" as const, preserved: true };
  }
  const context = meeting.calendar_event_id
    ? `회의 제목: ${meeting.title}\n`
    : `제목: ${meeting.title}\n`;
  try {
    const { output: generated } = await llmGenerate<MeetingSummary>({
      db: ctx.db,
      userId: ctx.userId,
      role: "summarize",
      feature: "summarize",
      ref: { type: "meeting", id: meetingId },
      instructions: meetingSummaryPrompt(),
      prompt: `${context}전사(${used} 패스, ${segments.length}개 구간):\n${text.slice(0, 120_000)}`,
      output: meetingSummarySchema,
      maxOutputTokens: 2000,
    });
    // Generated content may only commit against the source snapshot it read.
    const edits = (meeting.summary_edits ?? {}) as Partial<
      Pick<MeetingSummary, "tldr" | "decisions">
    >;
    const output = attachSummarySources(
      {
        ...generated,
        ...edits,
        ...(edits.decisions ? { decisionSources: [] } : {}),
      },
      segments,
    );
    const { data: updated, error } = await ctx.db
      .from("meetings")
      .update({
        status: "ready",
        summary: output as unknown as Json,
        summary_md: summaryToMarkdown(output),
        summary_version: meeting.summary_version + 1,
        summary_model: MODEL_IDS.summarize,
      })
      .eq("id", meetingId)
      .eq("user_id", ctx.userId)
      .eq("content_version", meeting.content_version)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!updated) return { status: "source_changed" as const, preserved: true };
    await meetingChanged(ctx, updated, "updated");
    await ctx.emit({
      type: MEETING_EVENTS.summarized,
      entity: { type: "meeting", id: meetingId },
      payload: {
        pass,
        version: updated.content_version,
        actionItems: output.actionItems.length,
        summaryText: `${output.tldr}\n${output.decisions.join("\n")}`,
      },
    });
    return { status: "summarized" as const, version: updated.content_version };
  } catch (e) {
    await ctx.db
      .from("meetings")
      .update({ status: "failed" })
      .eq("id", meetingId)
      .eq("user_id", ctx.userId)
      .eq("content_version", meeting.content_version);
    throw e;
  }
}
