import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineTool, type ServiceContext } from "@/core/contracts";
import type { Json } from "@/core/db/types.generated";
import { createRegistry } from "@/core/registry/registry";
import { tasksModule } from "@/modules/tasks/module";
import { tasksService } from "@/modules/tasks/service";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { meetingContextProvider } from "../context";
import {
  createMeetingNote,
  editMeetingSummary,
  editTranscript,
} from "../editing";
import { meetingsIndexer } from "../indexer";
import { postprocessMeeting } from "../postprocess";
import { meetingPreparation } from "../preparation";
import { createMeetingTasks, undoMeetingFollowups } from "../review";
import { meetingActionKey } from "../review-items";
import type { MeetingSummary } from "../schema";
import { searchMeetingContent } from "../search";
import { meetingsService } from "../service";
import { meetingsTools } from "../tools";

const generate = vi.hoisted(() => vi.fn());
vi.mock("@/core/llm/client", () => ({ llmGenerate: generate }));
const summary: MeetingSummary = {
  tldr: "이전 예산",
  decisions: ["이전 결정"],
  keyPoints: [],
  actionItems: [],
  participants: [],
  openQuestions: [],
  followups: [],
};
const available = await localSupabaseAvailable();
describe.skipIf(!available)(
  "assistant meeting acceptance contracts (local DB, no LLM)",
  () => {
    let user: Awaited<ReturnType<typeof testUser>>;
    let other: Awaited<ReturnType<typeof testUser>>;
    let ctx: ServiceContext;
    const emit = vi.fn<ServiceContext["emit"]>(async () => {});
    beforeAll(async () => {
      user = await testUser("meeting-contract");
      other = await testUser("meeting-contract-other");
      ctx = {
        db: user.db,
        userId: user.id,
        actor: "user",
        timezone: "Asia/Seoul",
        now: new Date("2026-09-10T00:00:00Z"),
        registry: createRegistry(() => [tasksModule]),
        emit,
        enqueue: async () => "",
      };
      await tasksService(ctx).ensureDefaultBoard();
    });
    afterAll(async () => {
      await user?.cleanup();
      await other?.cleanup();
    });
    async function meeting(patch: Record<string, unknown> = {}) {
      const m = await user.db
        .from("meetings")
        .insert({
          title: "회의 계약",
          status: "ready",
          started_at: "2026-09-05T00:00:00Z",
          summary: summary as unknown as Json,
          summary_md: "이전 예산 이전 결정",
          ...patch,
        })
        .select("*")
        .single();
      if (m.error) throw m.error;
      return m.data;
    }
    const execute = (name: string, input: unknown) => {
      const tool = meetingsTools[name];
      if (!tool) throw new Error(`missing tool ${name}`);
      return tool.execute(tool.inputSchema.parse(input), ctx);
    };
    it("A04 keeps long originals and last valid summaries for manual, empty, and failed regeneration", async () => {
      const text = `${"회의 원문 ".repeat(120)}끝의 고유 결정`;
      const m = await createMeetingNote(ctx, {
        id: crypto.randomUUID(),
        title: "긴 메모",
        text,
      });
      const manual = await execute("summarize", { id: m.id });
      expect(manual).toMatchObject({
        status: "unsupported",
        reason: "manual_note",
        preserved: true,
      });
      expect((await meetingsService(ctx).get(m.id))?.note_text).toBe(text);
      expect(generate).not.toHaveBeenCalled();
      const empty = await meeting();
      expect(await postprocessMeeting(ctx, empty.id, "live")).toMatchObject({
        status: "insufficient_content",
        preserved: true,
      });
      expect((await meetingsService(ctx).get(empty.id))?.summary).toEqual(
        summary,
      );
      const failed = await meeting();
      await meetingsService(ctx).appendLiveTurns(failed.id, 0, 0, [
        {
          turnId: 0,
          startMs: 0,
          endMs: 1000,
          text: "실패해도 보존해야 하는 유효한 전사 내용을 충분히 길게 설명합니다. 이전 요약을 덮어쓰지 않아야 합니다.",
        },
      ]);
      generate.mockRejectedValueOnce(new Error("injected generation failure"));
      await expect(postprocessMeeting(ctx, failed.id, "live")).rejects.toThrow(
        "injected",
      );
      expect((await meetingsService(ctx).get(failed.id))?.summary).toEqual(
        summary,
      );
      expect((await meetingsService(ctx).get(failed.id))?.status).toBe(
        "failed",
      );
    });
    it("A05/A19/A20 shares corrected title, decisions, speaker and transcript across tools/context/index/search", async () => {
      const m = await meeting();
      const row = await user.db
        .from("transcript_segments")
        .insert({
          meeting_id: m.id,
          pass: "final",
          seq: 0,
          turn_id: 0,
          start_ms: 0,
          end_ms: 1000,
          text: "오인식단어",
          speaker: "S1",
        })
        .select("id")
        .single();
      if (row.error) throw row.error;
      await execute("editTitle", { id: m.id, title: "교정된 제목" });
      await execute("editSpeaker", { id: m.id, speaker: "S1", name: "민수" });
      await execute("editSummary", {
        id: m.id,
        tldr: "확정 예산",
        decisions: ["최종오백만원"],
      });
      await execute("editTranscript", {
        id: m.id,
        segmentId: row.data.id,
        text: "교정된단어",
      });
      const saved = await meetingsService(ctx).get(m.id);
      expect(saved?.title).toBe("교정된 제목");
      expect(saved?.summary_md).toContain("최종오백만원");
      expect(saved?.summary_md).not.toContain("이전 결정");
      const get = await execute("get", { id: m.id });
      expect(get).toMatchObject({
        title: saved?.title,
        version: saved?.content_version,
        speakerMap: { S1: "민수" },
      });
      const content = await execute("readContent", {
        id: m.id,
        section: "transcript",
      });
      expect(content.items[0]).toMatchObject({
        segmentId: row.data.id,
        text: "교정된단어",
        speakerName: "민수",
      });
      const context = await meetingContextProvider.build(
        {
          ...ctx,
          ui: {
            route: `/meetings/${m.id}`,
            entity: { type: "meeting", id: m.id },
          },
        },
        "교정된단어",
      );
      expect(context).toContain("최종오백만원");
      expect(context).toContain("민수: 교정된단어");
      const chunks = await meetingsIndexer.chunks(m.id, ctx);
      expect(chunks.map((c) => c.content).join("\n")).toContain("최종오백만원");
      expect(
        chunks.every((c) => c.metadata?.version === saved?.content_version),
      ).toBe(true);
      const hits = await searchMeetingContent(ctx, {
        query: "교정된단어",
        meetingId: m.id,
      });
      expect(hits.items[0]).toMatchObject({
        segmentId: row.data.id,
        href: `/meetings/${m.id}?at=0`,
      });
      expect(
        (
          await searchMeetingContent(ctx, {
            query: "오인식단어",
            meetingId: m.id,
          })
        ).total,
      ).toBe(0);
      expect(
        (
          await searchMeetingContent(ctx, {
            query: "최종오백만원",
            meetingId: m.id,
          })
        ).items[0]?.part,
      ).toBe("summary");
      const changes = emit.mock.calls
        .map(
          (call) => call[0] as { type: string; payload: { version: number } },
        )
        .filter((e) => e.type === "meeting.changed");
      expect(changes.slice(-4).map((e) => e.payload.version)).toEqual([
        m.content_version + 1,
        m.content_version + 2,
        m.content_version + 3,
        m.content_version + 4,
      ]);
      await expect(
        editTranscript(
          { ...ctx, db: other.db, userId: other.id },
          m.id,
          row.data.id,
          "침범",
        ),
      ).rejects.toThrow();
    });
    it("A19/A20 pages the complete note and searches text after the first 400 characters", async () => {
      const text = `${"원문 ".repeat(500)}끝의고유어`;
      const created = await execute("createNote", {
        id: crypto.randomUUID(),
        title: "AI 메모",
        text,
      });
      const first = await execute("readContent", {
        id: created.id,
        section: "note",
        limit: 1,
      });
      expect(first.hasMore).toBe(true);
      const rest = await execute("readContent", {
        id: created.id,
        section: "note",
        offset: first.nextOffset,
      });
      expect([...first.items, ...rest.items].map((p) => p.text).join("")).toBe(
        text,
      );
      expect(rest.hasMore).toBe(false);
      expect(
        (
          await execute("search", {
            query: "끝의고유어",
            meetingId: created.id,
          })
        ).items[0],
      ).toMatchObject({
        part: "note",
        href: `/meetings/${created.id}#note-original`,
      });
    });
    it("A21 defaults only to my tasks and honors owner/date/kind overrides with one creator under retries", async () => {
      const actions = [
        { title: "내 보고서", owner: "나", sourceSeq: [1] },
        { title: "민수 답변", owner: "민수", sourceSeq: [2] },
        { title: "미정", sourceSeq: [3] },
      ];
      const m = await meeting({
        summary: { ...summary, actionItems: actions },
      });
      const mine = await execute("createTasksFromActionItems", { id: m.id });
      expect(mine.results).toHaveLength(1);
      if (!actions[1]) throw new Error("missing action");
      const choices = [
        {
          key: meetingActionKey(m.id, actions[1]),
          title: "시안 답변 확인",
          owner: "민수",
          kind: "waiting" as const,
          dueAt: "2026-09-12T09:00:00Z",
          dueHasTime: true,
        },
      ];
      const [a, b] = await Promise.all([
        createMeetingTasks(ctx, m.id, choices),
        createMeetingTasks(ctx, m.id, choices),
      ]);
      expect(a[0]?.entityId).toBe(b[0]?.entityId);
      expect([...a, ...b].filter((r) => r.createdNow)).toHaveLength(1);
      const card = await tasksService(ctx).getCard(a[0]?.entityId ?? "");
      expect(card?.title).toBe("확인: 시안 답변 확인");
      expect(card?.description_md).toBe("담당: 민수");
      expect(new Date(card?.due_at ?? "").toISOString()).toBe(
        "2026-09-12T09:00:00.000Z",
      );
      expect(
        (await createMeetingTasks(ctx, m.id, choices))[0]?.createdNow,
      ).toBe(false);
    });
    it("A22 preserves confirmed references through task retry; Undo skips reused and removes fresh reference only", async () => {
      const action = { title: "자료", owner: "나", sourceSeq: [1] };
      const m = await meeting({
        summary: { ...summary, actionItems: [action] },
      });
      const original = await createMeetingTasks(ctx, m.id, [
        {
          key: meetingActionKey(m.id, action),
          title: "자료",
          kind: "reference",
        },
      ]);
      const retry = await execute("createTasksFromActionItems", {
        id: m.id,
        indexes: [0],
      });
      expect(retry.results[0]).toMatchObject({
        kind: "reference",
        entityId: original[0]?.entityId,
        createdNow: false,
      });
      await undoMeetingFollowups(ctx, m.id, retry.results);
      expect(
        (
          await user.db
            .from("meeting_followups")
            .select("id")
            .eq("meeting_id", m.id)
        ).data,
      ).toHaveLength(1);
      await undoMeetingFollowups(ctx, m.id, original);
      expect(
        (
          await user.db
            .from("meeting_followups")
            .select("id")
            .eq("meeting_id", m.id)
        ).data,
      ).toHaveLength(0);
      expect(
        (await user.db.from("cards").select("id").eq("meeting_id", m.id)).data,
      ).toHaveLength(0);
    });
    it("A22 keeps events typed on retry and routes fresh-event Undo only to the calendar", async () => {
      const integration = await user.db
        .from("integrations")
        .insert({ provider: "google_calendar" })
        .select("id")
        .single();
      if (integration.error) throw integration.error;
      const calendar = await user.db
        .from("calendars")
        .insert({
          integration_id: integration.data.id,
          external_id: "undo-fixture",
          name: "undo fixture",
        })
        .select("id")
        .single();
      if (calendar.error) throw calendar.error;
      const taskDelete = vi.fn();
      const eventDelete = vi.fn(
        async ({
          id,
          expectedVersion,
        }: {
          id: string;
          expectedVersion?: string;
        }) => {
          const q = user.db
            .from("calendar_events")
            .delete()
            .eq("id", id)
            .eq("user_id", user.id);
          const removed = await (expectedVersion
            ? q.eq("updated_at", expectedVersion)
            : q
          ).select("id");
          if (removed.error) throw removed.error;
          expect(removed.data).toHaveLength(1);
          return { id };
        },
      );
      const toolMap = {
        ...ctx.registry.tools(),
        "tasks.delete": defineTool({
          description: "test sentinel",
          inputSchema: z.object({ id: z.string() }),
          risk: "destructive",
          execute: taskDelete,
        }),
        "calendar.createEvent": defineTool({
          description: "local fixture only",
          inputSchema: z.object({
            title: z.string(),
            creationKey: z.string(),
            startAt: z.string(),
          }),
          risk: "write",
          execute: async (input) => {
            const result = await user.db
              .from("calendar_events")
              .insert({
                calendar_id: calendar.data.id,
                external_id: crypto.randomUUID(),
                creation_key: input.creationKey,
                title: input.title,
                start_at: input.startAt,
                end_at: "2026-09-12T10:00:00Z",
              })
              .select("id")
              .single();
            if (result.error) throw result.error;
            return { id: result.data.id, createdNow: true };
          },
        }),
        "calendar.deleteEvent": defineTool({
          description: "local fixture only",
          inputSchema: z.object({
            id: z.string(),
            expectedVersion: z.string().optional(),
          }),
          risk: "destructive",
          execute: eventDelete,
        }),
      };
      const registry = createRegistry(() => [tasksModule]);
      vi.spyOn(registry, "tools").mockReturnValue(toolMap);
      const eventCtx = { ...ctx, registry };
      const action = { title: "후속 일정", owner: "나", sourceSeq: [1] };
      const m = await meeting({
        summary: { ...summary, actionItems: [action] },
      });
      const key = meetingActionKey(m.id, action);
      const original = await createMeetingTasks(eventCtx, m.id, [
        {
          key,
          title: "후속 일정",
          kind: "event",
          dueAt: "2026-09-12T09:00:00Z",
          dueHasTime: true,
        },
      ]);
      expect(original[0]).toMatchObject({ kind: "event", createdNow: true });
      const retry = await createMeetingTasks(eventCtx, m.id, [
        { key, title: "다시 할 일로", kind: "task" },
      ]);
      expect(retry[0]).toMatchObject({
        kind: "event",
        entityId: original[0]?.entityId,
        createdNow: false,
      });
      await undoMeetingFollowups(eventCtx, m.id, retry);
      expect(eventDelete).not.toHaveBeenCalled();
      await undoMeetingFollowups(eventCtx, m.id, original);
      expect(eventDelete).toHaveBeenCalledOnce();
      expect(taskDelete).not.toHaveBeenCalled();
      expect(
        (
          await user.db
            .from("calendar_events")
            .select("id")
            .eq("id", original[0]?.entityId ?? "")
        ).data,
      ).toEqual([]);
    });
    it("A33 prefers actual series links despite renamed titles and treats same-title strangers only as candidates", async () => {
      const integration = await user.db
        .from("integrations")
        .upsert(
          { provider: "google_calendar" },
          { onConflict: "user_id,provider" },
        )
        .select("id")
        .single();
      if (integration.error) throw integration.error;
      const calendar = await user.db
        .from("calendars")
        .insert({
          integration_id: integration.data.id,
          external_id: "fixture",
          name: "fixture",
        })
        .select("id")
        .single();
      if (calendar.error) throw calendar.error;
      const event = async (title: string, series: string) => {
        const result = await user.db
          .from("calendar_events")
          .insert({
            calendar_id: calendar.data.id,
            external_id: crypto.randomUUID(),
            title,
            recurring_event_id: series,
            start_at: "2026-09-11T01:00:00Z",
            end_at: "2026-09-11T02:00:00Z",
          })
          .select("id")
          .single();
        if (result.error) throw result.error;
        return result.data.id;
      };
      const old = await event("옛 제목", "real-series");
      const current = await event("주간 제품 회의", "real-series");
      const prior = await meeting({
        title: "완전히 바뀐 회의 제목",
        calendar_event_id: old,
      });
      await editMeetingSummary(ctx, prior.id, {
        tldr: "최신",
        decisions: ["교정된 준비 결정"],
      });
      const unrelated = await meeting({ title: "주간 제품 회의" });
      const prepared = await meetingPreparation(ctx, current);
      expect(prepared.previous.map((m) => m.id)).toEqual([prior.id]);
      expect(prepared.previous[0]?.decisions).toEqual(["교정된 준비 결정"]);
      expect(await meetingPreparation(ctx, current)).toEqual(prepared);
      const different = await event("주간 제품 회의", "unrelated-series");
      const cautious = await meetingPreparation(ctx, different);
      expect(cautious.previous).toEqual([]);
      expect(cautious.relationship).toBe("none");
      expect(cautious.unverifiedTitleMatches.map((m) => m.id)).toContain(
        unrelated.id,
      );
    });
  },
);
