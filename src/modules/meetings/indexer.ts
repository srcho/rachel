import type { IndexChunk, Indexer } from "@/core/contracts";
import { fmtClock } from "./format";
import { meetingsService } from "./service";

const CHUNK_CHARS = 700; // ≈ 400~500 토큰(한국어)

/** 회의 = 요약 청크 1개 + 전사 청크 N개(발화 경계 유지) */
export const meetingsIndexer: Indexer = {
  sourceType: "meeting",
  on: ["meeting.summarized", "meeting.transcribed", "meeting.deleted"],
  chunks: async (id, ctx) => {
    const svc = meetingsService(ctx);
    const m = await svc.get(id);
    if (!m) return [];
    const date = new Date(m.started_at).toLocaleDateString("ko-KR");
    const meta = { title: m.title, href: `/meetings/${id}`, date };
    const out: IndexChunk[] = [];
    if (m.summary_md)
      out.push({
        index: 0,
        content: `${m.title} (${date})\n${m.summary_md}`.slice(0, 3000),
        metadata: { ...meta, part: "summary" },
      });
    const { segments } = await svc.transcript(id);
    const speakerMap = (m.speaker_map as Record<string, string>) ?? {};
    let buf = "";
    let startMs = 0;
    let index = out.length;
    for (const s of segments) {
      if (!s.text.trim()) continue;
      const line = `[${fmtClock(s.start_ms)}] ${s.speaker ? `${speakerMap[s.speaker] ?? s.speaker}: ` : ""}${s.text.trim()}`;
      if (buf.length + line.length > CHUNK_CHARS && buf) {
        out.push({
          index: index++,
          content: `${m.title} (${date})\n${buf}`,
          metadata: { ...meta, part: "transcript", startMs },
        });
        buf = "";
      }
      if (!buf) startMs = s.start_ms;
      buf += (buf ? "\n" : "") + line;
    }
    if (buf)
      out.push({
        index,
        content: `${m.title} (${date})\n${buf}`,
        metadata: { ...meta, part: "transcript", startMs },
      });
    return out;
  },
};
