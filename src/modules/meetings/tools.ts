import { z } from "zod";
import { type AnyAgentTool, defineTool } from "@/core/contracts";
import { fmtClock, fmtDuration } from "./format";
import { postprocessMeeting } from "./postprocess";
import type { MeetingRow } from "./repository";
import type { MeetingSummary } from "./schema";
import { meetingsService } from "./service";

function summarize(m: MeetingRow) {
  const s = m.summary as MeetingSummary | null;
  return {
    id: m.id,
    title: m.title,
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
        transcriptPass: pass,
        segmentCount: segments.length,
        speakerMap: m.speaker_map,
        linkedCalendarEventId: m.calendar_event_id,
      };
    },
  }),
  search: defineTool({
    description:
      "회의 전사·요약에서 키워드를 찾는다(부분 일치). 결과는 회의·시각·문장. '지난번에 예산 얘기' 같은 질문에 쓴다.",
    inputSchema: z.object({
      query: z.string().min(1),
      limit: z.number().int().min(1).max(30).default(10),
    }),
    risk: "read",
    execute: async ({ query, limit }, ctx) => {
      const { data, error } = await ctx.db
        .from("transcript_segments")
        .select("meeting_id, start_ms, text, speaker, pass")
        .eq("user_id", ctx.userId)
        .ilike("text", `%${query}%`)
        .order("start_ms")
        .limit(limit * 3);
      if (error) throw error;
      const rows = (data ?? [])
        .filter(
          (r, i, arr) =>
            !arr.some(
              (o, j) =>
                j < i &&
                o.meeting_id === r.meeting_id &&
                Math.abs(o.start_ms - r.start_ms) < 1000,
            ),
        )
        .slice(0, limit);
      const ids = [...new Set(rows.map((r) => r.meeting_id))];
      const { data: meetings } = await ctx.db
        .from("meetings")
        .select("id, title, started_at")
        .eq("user_id", ctx.userId)
        .in("id", ids);
      const titleOf = (id: string) => meetings?.find((m) => m.id === id);
      return rows.map((r) => ({
        meetingId: r.meeting_id,
        meeting: titleOf(r.meeting_id)?.title,
        date: titleOf(r.meeting_id)?.started_at,
        at: fmtClock(r.start_ms),
        speaker: r.speaker,
        text: r.text,
      }));
    },
  }),
  summarize: defineTool({
    description:
      "회의 요약을 다시 만든다(전사 기준). 사용자가 '다시 요약해 줘' 라고 할 때.",
    inputSchema: z.object({ id: z.string().uuid() }),
    risk: "write",
    execute: async ({ id }, ctx) => {
      const svc = meetingsService(ctx);
      const { pass } = await svc.transcript(id);
      await postprocessMeeting(ctx, id, pass);
      const m = await svc.get(id);
      return { id, summary: m?.summary ?? null, version: m?.summary_version };
    },
  }),
  createTasksFromActionItems: defineTool({
    description:
      "회의 요약의 액션 아이템(인덱스 목록 또는 전부)을 할 일 카드로 만든다. 먼저 어떤 항목인지 사용자에게 보여 주고 실행한다.",
    inputSchema: z.object({
      id: z.string().uuid(),
      indexes: z
        .array(z.number().int().min(0))
        .optional()
        .describe("없으면 전부"),
    }),
    risk: "write",
    execute: async ({ id, indexes }, ctx) => {
      const m = await meetingsService(ctx).get(id);
      const s = m?.summary as MeetingSummary | null;
      if (!m || !s) throw new Error("요약이 없는 회의예요");
      const create = ctx.registry.tools()["tasks.create"];
      if (!create) throw new Error("tasks 모듈이 없어요");
      const chosen = s.actionItems.filter(
        (_, i) => !indexes || indexes.includes(i),
      );
      const created: string[] = [];
      for (const a of chosen) {
        const card = (await create.execute(
          {
            title: a.title,
            description: a.owner ? `담당: ${a.owner}` : "",
            meetingId: id,
            source: { type: "meeting", ref_id: id },
          },
          ctx,
        )) as { id: string };
        created.push(card.id);
      }
      return {
        created: created.length,
        cardIds: created,
        meeting: m.title,
        duration: fmtDuration(m.duration_sec),
      };
    },
    undo: async (output, ctx) => {
      const del = ctx.registry.tools()["tasks.delete"];
      for (const id of output.cardIds) await del?.execute({ id }, ctx);
    },
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
