import { z } from "zod";
import type { ServiceContext } from "@/core/contracts";
import type { Json } from "@/core/db/types.generated";
import { meetingChanged } from "./changed";
import { summaryToMarkdown } from "./content";
import { meetingsRepository } from "./repository";
import { meetingSummarySchema } from "./schema";

export const summaryEdits = z.object({
  tldr: z.string().trim().min(1).max(400),
  decisions: z.array(z.string().trim().min(1).max(200)).max(10),
});
export async function editMeetingSummary(
  ctx: ServiceContext,
  id: string,
  raw: z.infer<typeof summaryEdits>,
) {
  const patch = summaryEdits.parse(raw);
  const repo = meetingsRepository(ctx.db, ctx.userId);
  const m = await repo.get(id);
  if (!m) throw new Error("회의를 찾을 수 없어요");
  const summary = meetingSummarySchema.parse(m.summary);
  const updated = await repo.update(id, {
    summary_edits: patch,
    summary_md: summaryToMarkdown({ ...summary, ...patch }),
    summary: { ...summary, ...patch, decisionSources: [] } as unknown as Json,
  });
  await meetingChanged(ctx, updated, "summary");
  return updated;
}
export async function editTranscript(
  ctx: ServiceContext,
  meetingId: string,
  segmentId: string,
  text: string,
) {
  const input = z.string().trim().min(1).max(10000).parse(text);
  const repo = meetingsRepository(ctx.db, ctx.userId);
  const m = await repo.get(meetingId);
  if (!m) throw new Error("회의를 찾을 수 없어요");
  const { data: segment, error } = await ctx.db
    .from("transcript_segments")
    .select("pass, seq, turn_id")
    .eq("user_id", ctx.userId)
    .eq("meeting_id", meetingId)
    .eq("id", segmentId)
    .single();
  if (error) throw error;
  const key = `${segment.pass}:${segment.seq}:${segment.turn_id}`;
  const { error: writeError } = await ctx.db.rpc(
    "set_meeting_transcript_edit",
    { p_meeting_id: meetingId, p_key: key, p_text: input },
  );
  if (writeError) throw writeError;
  const updated = await repo.get(meetingId);
  if (updated) await meetingChanged(ctx, updated, "transcript");
}
export async function createMeetingNote(
  ctx: ServiceContext,
  raw: { id: string; title: string; text: string },
) {
  const input = z
    .object({
      id: z.string().uuid(),
      title: z.string().trim().min(1).max(200),
      text: z.string().trim().min(1).max(10000),
    })
    .parse(raw);
  const summary = {
    tldr: input.text.slice(0, 400),
    keyPoints: [],
    decisions: [],
    actionItems: [],
    openQuestions: [],
    participants: [],
    followups: [],
  };
  const { error } = await ctx.db.from("meetings").upsert(
    {
      id: input.id,
      user_id: ctx.userId,
      title: input.title,
      status: "ready",
      final_pass_status: "skipped",
      ended_at: ctx.now.toISOString(),
      summary,
      summary_edits: { tldr: summary.tldr, decisions: [] },
      note_text: input.text,
      summary_md: summaryToMarkdown(summary),
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) throw error;
  const repo = meetingsRepository(ctx.db, ctx.userId);
  const saved = await repo.get(input.id);
  if (!saved) throw new Error("회의 메모를 저장하지 못했어요");
  await meetingChanged(ctx, saved, "note_created");
  return saved;
}
