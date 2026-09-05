import type { ServiceContext } from "@/core/contracts";
import type { Json } from "@/core/db/types.generated";
import { llmGenerate } from "@/core/llm/client";
import { MODEL_IDS } from "@/core/llm/models";
import { meetingSummaryPrompt } from "@/core/llm/prompts/meeting-summary";
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

export function summaryToMarkdown(s: MeetingSummary): string {
  const li = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");
  const parts = [`**요약** ${s.tldr}`];
  if (s.keyPoints.length) parts.push(`**핵심**\n${li(s.keyPoints)}`);
  if (s.decisions.length) parts.push(`**결정**\n${li(s.decisions)}`);
  if (s.actionItems.length)
    parts.push(
      `**액션 아이템**\n${li(s.actionItems.map((a) => `${a.title}${a.owner ? ` — ${a.owner}` : ""}${a.due ? ` (${a.due})` : ""}`))}`,
    );
  if (s.openQuestions.length)
    parts.push(`**열린 질문**\n${li(s.openQuestions)}`);
  if (s.followups.length)
    parts.push(
      `**후속**\n${li(s.followups.map((f) => `${f.title}${f.when ? ` (${f.when})` : ""}`))}`,
    );
  return parts.join("\n\n");
}

/**
 * 요약 생성. pass='live' 는 종료 직후(빠르게), 'final' 은 화자 분리 후(정확하게).
 * 전사가 너무 짧으면 요약 없이 ready 처리.
 */
export async function postprocessMeeting(
  ctx: ServiceContext,
  meetingId: string,
  pass: "live" | "final",
): Promise<void> {
  const svc = meetingsService(ctx);
  const meeting = await svc.get(meetingId);
  if (!meeting) return;
  const { pass: used, segments } = await svc.transcript(meetingId);
  if (pass === "final" && used !== "final") return; // 파이널 전사가 없으면 건너뜀
  const text = assembleTranscript(meeting, segments);
  if (text.length < 40) {
    await svc.update(meetingId, {
      status: "ready",
      summary_md: "전사된 내용이 너무 짧아 요약을 만들지 않았어요.",
      summary_version: meeting.summary_version + 1,
    });
    await ctx.emit({
      type: MEETING_EVENTS.summarized,
      entity: { type: "meeting", id: meetingId },
      payload: { pass, empty: true },
    });
    return;
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
    // Apply explicit edits after generation, including edits saved while the model ran.
    const latest = await svc.get(meetingId);
    const edits = (latest?.summary_edits ?? {}) as Partial<
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
    await svc.update(meetingId, {
      status: "ready",
      summary: output as unknown as Json,
      summary_md: summaryToMarkdown(output),
      summary_version: meeting.summary_version + 1,
      summary_model: MODEL_IDS.summarize,
      title:
        meeting.title.startsWith("회의 ") && output.tldr
          ? meeting.title
          : meeting.title,
    });
    await ctx.emit({
      type: MEETING_EVENTS.summarized,
      entity: { type: "meeting", id: meetingId },
      payload: {
        pass,
        actionItems: output.actionItems.length,
        summaryText: `${output.tldr}\n${output.decisions.join("\n")}`,
      },
    });
  } catch (e) {
    await svc.update(meetingId, { status: "failed" });
    throw e;
  }
}
