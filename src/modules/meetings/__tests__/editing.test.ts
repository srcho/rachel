import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ServiceContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import {
  createMeetingNote,
  editMeetingSummary,
  editTranscript,
} from "../editing";
import { attachSummarySources } from "../postprocess";
import { meetingSummarySchema } from "../schema";
import { meetingsService } from "../service";

const available = await localSupabaseAvailable();
describe.skipIf(!available)("meeting notes and corrections", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let other: Awaited<ReturnType<typeof testUser>>;
  let ctx: ServiceContext;
  beforeAll(async () => {
    user = await testUser("meeting-edits");
    other = await testUser("meeting-edits-other");
    ctx = {
      db: user.db,
      userId: user.id,
      actor: "user",
      timezone: "Asia/Seoul",
      now: new Date("2026-09-05T00:00:00Z"),
      registry: createRegistry(() => []),
      emit: async () => {},
      enqueue: async () => "",
    };
  });
  afterAll(async () => {
    await user?.cleanup();
    await other?.cleanup();
  });
  it("creates one unrecorded note per retry and preserves explicit fields through a stale generated update", async () => {
    const input = {
      id: crypto.randomUUID(),
      title: "제품 검토",
      text: "예산은 300만 원으로 결정했어요.",
    };
    const m = await createMeetingNote(ctx, input);
    expect((await createMeetingNote(ctx, input)).id).toBe(m.id);
    await editMeetingSummary(ctx, m.id, {
      tldr: "확정 예산은 500만 원이에요.",
      decisions: ["500만 원으로 진행"],
    });
    await meetingsService(ctx).update(m.id, { summary: m.summary });
    const saved = await meetingsService(ctx).get(m.id);
    expect(meetingSummarySchema.parse(saved?.summary).tldr).toBe(
      "확정 예산은 500만 원이에요.",
    );
    expect(meetingSummarySchema.parse(saved?.summary).decisions).toEqual([
      "500만 원으로 진행",
    ]);
    await expect(
      editMeetingSummary({ ...ctx, db: other.db, userId: other.id }, m.id, {
        tldr: "침범",
        decisions: [],
      }),
    ).rejects.toThrow("회의를 찾을 수 없어요");
  });
  it("preserves corrected transcript across re-upload and keeps only real source references", async () => {
    const svc = meetingsService(ctx);
    const m = await svc.start({ title: "숫자 정정" });
    const rows = await svc.appendLiveTurns(m.id, 4, 10000, [
      { turnId: 1, startMs: 0, endMs: 1000, text: "삼백만" },
    ]);
    const segment = rows[0];
    if (!segment) throw new Error("missing fixture");
    await editTranscript(ctx, m.id, segment.id, "500만 원");
    await svc.appendLiveTurns(m.id, 4, 10000, [
      { turnId: 1, startMs: 0, endMs: 1000, text: "300만 원" },
    ]);
    const transcript = await svc.transcript(m.id);
    expect(transcript.segments[0]?.text).toBe("500만 원");
    const summary = meetingSummarySchema.parse({
      tldr: "예산",
      keyPoints: [],
      decisions: ["확정"],
      actionItems: [{ title: "송금", sourceSeq: [4, 999] }],
      openQuestions: [],
      participants: [],
      followups: [],
      decisionSources: [{ decisionIndex: 0, sourceSeq: [4, 99] }],
    });
    const linked = attachSummarySources(summary, transcript.segments);
    expect(linked.actionItems[0]?.sourceSeq).toEqual([4]);
    expect(linked.actionItems[0]?.sourceAtMs).toEqual([10000]);
    expect(linked.decisionSources?.[0]?.sourceSeq).toEqual([4]);
    const denied = await other.db.rpc("set_meeting_transcript_edit", {
      p_meeting_id: m.id,
      p_key: "live:4:1",
      p_text: "침범",
    });
    expect(denied.error).not.toBeNull();
  });
  it("pages and searches notes without mistaking no followups for failed loading", async () => {
    const repo = meetingsService(ctx).repo;
    const list = await repo.listPage({ query: "제품", page: 1 });
    expect(list.total).toBe(1);
    expect(list.meetings[0]?.title).toBe("제품 검토");
    const pending = await repo.listPage({ pending: true });
    expect(pending.total).toBe(0);
  });
});
