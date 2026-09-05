import { z } from "zod";
import { type AnyAgentTool, defineTool } from "@/core/contracts";
import {
  createMeetingNote,
  editMeetingSummary,
  editTranscript,
  summaryEdits,
} from "./editing";
import { postprocessMeeting } from "./postprocess";
import { meetingPreparation } from "./preparation";
import type { MeetingRow } from "./repository";
import {
  createMeetingTasks,
  reviewChoiceSchema,
  undoMeetingFollowups,
} from "./review";
import { meetingActionKey } from "./review-items";
import type { MeetingSummary } from "./schema";
import { searchMeetingContent } from "./search";
import { meetingsService } from "./service";

function summarize(m: MeetingRow) {
  const s = m.summary as MeetingSummary | null;
  return {
    id: m.id,
    title: m.title,
    version: m.content_version,
    href: `/meetings/${m.id}`,
    startedAt: m.started_at,
    durationMin: m.duration_sec ? Math.round(m.duration_sec / 60) : null,
    status: m.status,
    tldr: s?.tldr ?? null,
    actionItems: s?.actionItems.length ?? 0,
  };
}

export const meetingsTools: Record<string, AnyAgentTool> = {
  list: defineTool({
    description: "최근 회의 목록(제목·시각·길이·요약 한 줄).",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(50).default(10),
    }),
    risk: "read",
    execute: async ({ limit }, ctx) =>
      (await meetingsService(ctx).list(limit)).map(summarize),
  }),
  get: defineTool({
    description:
      "회의 하나의 요약 전체(핵심·결정·액션 아이템·열린 질문)와 전사 길이.",
    inputSchema: z.object({ id: z.string().uuid() }),
    risk: "read",
    execute: async ({ id }, ctx) => {
      const svc = meetingsService(ctx);
      const m = await svc.get(id);
      if (!m) throw new Error("회의를 찾을 수 없어요");
      const { pass, segments } = await svc.transcript(id);
      return {
        ...summarize(m),
        summary: m.summary,
        actionItems:
          (m.summary as MeetingSummary | null)?.actionItems.map((a) => ({
            ...a,
            actionKey: meetingActionKey(id, a),
          })) ?? [],
        hasNote: m.note_text !== null,
        transcriptPass: pass,
        segmentCount: segments.length,
        speakerMap: m.speaker_map,
        linkedCalendarEventId: m.calendar_event_id,
      };
    },
  }),
  createNote: defineTool({
    description:
      "녹음 없는 회의 메모를 원문 전체로 보존한다. 재시도에는 같은 id를 사용한다.",
    inputSchema: z.object({
      id: z.string().uuid().optional(),
      title: z.string().trim().min(1).max(200),
      text: z.string().trim().min(1).max(10000),
    }),
    risk: "write",
    execute: async (input, ctx) =>
      summarize(
        await createMeetingNote(ctx, {
          ...input,
          id: input.id ?? crypto.randomUUID(),
        }),
      ),
  }),
  readContent: defineTool({
    description:
      "회의의 교정된 원문/요약/전사를 페이지로 읽는다. 전사 segmentId를 교정에 사용. nextOffset이 있으면 다음 페이지가 남아 있다.",
    inputSchema: z.object({
      id: z.string().uuid(),
      section: z.enum(["note", "summary", "transcript"]),
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(100).default(30),
    }),
    risk: "read",
    execute: async ({ id, section, offset, limit }, ctx) => {
      const svc = meetingsService(ctx);
      const m = await svc.get(id);
      if (!m) throw new Error("회의를 찾을 수 없어요");
      const { pass, segments } = await svc.transcript(id);
      const names = (m.speaker_map ?? {}) as Record<string, string>;
      const all =
        section === "transcript"
          ? segments.map((s) => ({
              segmentId: s.id,
              text: s.text,
              startMs: s.start_ms,
              speaker: s.speaker,
              speakerName: s.speaker ? (names[s.speaker] ?? s.speaker) : null,
              href: `/meetings/${id}?at=${s.start_ms}`,
            }))
          : ((section === "note" ? (m.note_text ?? "") : (m.summary_md ?? ""))
              .match(/[\s\S]{1,1000}/g)
              ?.map((text, index) => ({
                text,
                offset: index * 1000,
                href: `/meetings/${id}${section === "note" ? "#note-original" : ""}`,
              })) ?? []);
      const items = all.slice(offset, offset + limit);
      const hasMore = offset + items.length < all.length;
      return {
        id,
        version: m.content_version,
        section,
        pass,
        items,
        total: all.length,
        hasMore,
        nextOffset: hasMore ? offset + items.length : null,
      };
    },
  }),
  editTitle: defineTool({
    description: "회의 제목을 교정한다.",
    inputSchema: z.object({
      id: z.string().uuid(),
      title: z.string().trim().min(1).max(200),
    }),
    risk: "write",
    execute: async ({ id, title }, ctx) =>
      summarize(await meetingsService(ctx).rename(id, title)),
  }),
  editSpeaker: defineTool({
    description: "회의의 화자 식별자에 올바른 이름을 지정한다.",
    inputSchema: z.object({
      id: z.string().uuid(),
      speaker: z.string().min(1),
      name: z.string().trim().min(1).max(60),
    }),
    risk: "write",
    execute: async ({ id, speaker, name }, ctx) => {
      await meetingsService(ctx).setSpeakerName(id, speaker, name);
      return {
        id,
        speaker,
        name,
        version: (await meetingsService(ctx).get(id))?.content_version,
      };
    },
  }),
  editSummary: defineTool({
    description:
      "회의 요약과 결정을 교정한다. 현재 get 결과를 먼저 읽어 보존할 내용도 함께 전달한다.",
    inputSchema: summaryEdits.extend({ id: z.string().uuid() }),
    risk: "write",
    execute: async ({ id, ...patch }, ctx) =>
      summarize(await editMeetingSummary(ctx, id, patch)),
  }),
  editTranscript: defineTool({
    description: "readContent에서 읽은 segmentId의 전사를 교정한다.",
    inputSchema: z.object({
      id: z.string().uuid(),
      segmentId: z.string().uuid(),
      text: z.string().trim().min(1).max(10000),
    }),
    risk: "write",
    execute: async ({ id, segmentId, text }, ctx) => {
      await editTranscript(ctx, id, segmentId, text);
      return {
        id,
        segmentId,
        text,
        version: (await meetingsService(ctx).get(id))?.content_version,
      };
    },
  }),
  prepare: defineTool({
    description:
      "일정에 실제 연결된 이전 회의와 후속 할 일로 회의를 준비한다. 제목만 같은 후보는 확인되지 않은 별도 목록으로 반환한다.",
    inputSchema: z.object({ eventId: z.string().uuid() }),
    risk: "read",
    execute: async ({ eventId }, ctx) => meetingPreparation(ctx, eventId),
  }),
  search: defineTool({
    description:
      "교정된 전사·요약 결정·메모 원문·제목을 검색하고 위치 링크를 반환한다.",
    inputSchema: z.object({
      query: z.string().trim().min(1),
      limit: z.number().int().min(1).max(30).default(10),
      offset: z.number().int().min(0).default(0),
      meetingId: z.string().uuid().optional(),
      from: z.string().datetime({ offset: true }).optional(),
      to: z.string().datetime({ offset: true }).optional(),
    }),
    risk: "read",
    execute: async (input, ctx) => searchMeetingContent(ctx, input),
  }),
  summarize: defineTool({
    description:
      "회의 요약을 다시 만든다(전사 기준). 사용자가 '다시 요약해 줘' 라고 할 때.",
    inputSchema: z.object({ id: z.string().uuid() }),
    risk: "write",
    execute: async ({ id }, ctx) => {
      const svc = meetingsService(ctx);
      const { pass } = await svc.transcript(id);
      const result = await postprocessMeeting(ctx, id, pass);
      const m = await svc.get(id);
      return {
        id,
        ...result,
        summary: m?.summary ?? null,
        version: m?.content_version,
      };
    },
  }),
  reviewActionItems: defineTool({
    description:
      "명시적으로 선택한 회의 후속 항목을 담당·기한·분류 수정 후 확정한다. get의 actionKey 사용. 종류별 신규/재사용을 구분한다.",
    inputSchema: z.object({
      id: z.string().uuid(),
      choices: z.array(reviewChoiceSchema).min(1).max(15),
    }),
    risk: "write",
    execute: async ({ id, choices }, ctx) => {
      const results = await createMeetingTasks(ctx, id, choices);
      return {
        meetingId: id,
        results,
        created: results.filter((r) => r.createdNow).length,
        reused: results.filter((r) => !r.createdNow).length,
      };
    },
    undo: async (output, ctx) =>
      undoMeetingFollowups(ctx, output.meetingId, output.results),
  }),
  createTasksFromActionItems: defineTool({
    description:
      "명시한 인덱스의 후속 항목을 확정한다. 생략 시 담당이 '나/저/본인/me'인 항목만 선택한다. 담당 미정은 선택하지 않는다. 분류 수정은 reviewActionItems 사용.",
    inputSchema: z.object({
      id: z.string().uuid(),
      indexes: z.array(z.number().int().min(0)).optional(),
    }),
    risk: "write",
    execute: async ({ id, indexes }, ctx) => {
      const m = await meetingsService(ctx).get(id);
      const s = m?.summary as MeetingSummary | null;
      if (!m || !s) throw new Error("요약이 없는 회의예요");
      if (indexes?.some((i) => i >= s.actionItems.length))
        throw new Error("후속 항목 번호를 확인해 주세요");
      const chosen = s.actionItems.filter((a, i) =>
        indexes
          ? indexes.includes(i)
          : /^(나|저|본인|me)$/i.test(a.owner?.trim() ?? ""),
      );
      const results = await createMeetingTasks(
        ctx,
        id,
        chosen.map((a) => ({
          key: meetingActionKey(id, a),
          title: a.title,
          owner: a.owner,
          kind: /^(나|저|본인|me)$/i.test(a.owner?.trim() ?? "")
            ? ("task" as const)
            : a.owner
              ? ("waiting" as const)
              : ("reference" as const),
        })),
      );
      return {
        meetingId: id,
        results,
        created: results.filter((r) => r.createdNow).length,
        reused: results.filter((r) => !r.createdNow).length,
      };
    },
    undo: async (output, ctx) =>
      undoMeetingFollowups(ctx, output.meetingId, output.results),
  }),
  delete: defineTool({
    description:
      "회의와 전사·요약을 삭제한다. 되돌릴 수 없으니 먼저 확인받는다.",
    inputSchema: z.object({ id: z.string().uuid() }),
    risk: "destructive",
    execute: async ({ id }, ctx) => {
      const m = await meetingsService(ctx).remove(id);
      return { id, title: m.title };
    },
  }),
};
