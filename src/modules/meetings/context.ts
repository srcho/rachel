import type { ContextProvider } from "@/core/contracts";
import { fmtClock } from "./format";
import { meetingsService } from "./service";

/** 화면이 회의 상세일 때: 요약 + 질의어와 겹치는 전사 구간(최대 12줄). 검색 인덱스는 P4. */
export const meetingContextProvider: ContextProvider = {
  id: "meetings.scope",
  budgetTokens: 1800,
  build: async (ctx, userQuery) => {
    const entity = ctx.ui?.entity;
    if (!entity || entity.type !== "meeting") return null;
    const svc = meetingsService(ctx);
    const meeting = await svc.get(entity.id);
    if (!meeting) return null;
    const { segments } = await svc.transcript(entity.id);
    const speakerMap = (meeting.speaker_map as Record<string, string>) ?? {};
    const terms = userQuery
      .split(/\s+/)
      .filter((w) => w.length >= 2)
      .slice(0, 6);
    const hits = segments
      .filter((s) => terms.some((t) => s.text.includes(t)))
      .slice(0, 12);
    const lines = (hits.length > 0 ? hits : segments.slice(0, 8)).map(
      (s) =>
        `[${fmtClock(s.start_ms)}] ${s.speaker ? `${speakerMap[s.speaker] ?? s.speaker}: ` : ""}${s.text}`,
    );
    return [
      `[회의: ${meeting.title} ${new Date(meeting.started_at).toLocaleDateString("ko-KR")}]`,
      meeting.summary_md ? `요약:\n${meeting.summary_md}` : "요약 없음",
      `전사 발췌:\n${lines.join("\n")}`,
    ].join("\n");
  },
};
