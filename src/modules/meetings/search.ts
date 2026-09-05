import type { ServiceContext } from "@/core/contracts";
import { meetingsService } from "./service";

export async function searchMeetingContent(
  ctx: ServiceContext,
  input: {
    query: string;
    limit?: number;
    offset?: number;
    meetingId?: string;
    from?: string;
    to?: string;
  },
) {
  const svc = meetingsService(ctx);
  const needle = input.query.trim().toLocaleLowerCase();
  if (!needle) throw new Error("검색어를 입력해 주세요");
  const hits: Array<{
    meetingId: string;
    title: string;
    date: string;
    version: number;
    part: string;
    text: string;
    href: string;
    segmentId?: string;
    startMs?: number;
  }> = [];
  let page = 0;
  // Page every eligible meeting; a match may occur beyond the first API page.
  for (;;) {
    let query = ctx.db
      .from("meetings")
      .select("id")
      .eq("user_id", ctx.userId)
      .order("started_at", { ascending: false })
      .order("id")
      .range(page * 100, page * 100 + 99);
    if (input.meetingId) query = query.eq("id", input.meetingId);
    if (input.from) query = query.gte("started_at", input.from);
    if (input.to) query = query.lt("started_at", input.to);
    const rows = await query;
    if (rows.error) throw rows.error;
    for (const row of rows.data) {
      const m = await svc.get(row.id);
      if (!m) continue;
      const base = {
        meetingId: m.id,
        title: m.title,
        date: m.started_at,
        version: m.content_version,
      };
      for (const [part, text] of [
        ["title", m.title],
        ["summary", m.summary_md],
        ["note", m.note_text],
      ] as const) {
        if (text?.toLocaleLowerCase().includes(needle)) {
          const at = text.toLocaleLowerCase().indexOf(needle);
          hits.push({
            ...base,
            part,
            text: text.slice(Math.max(0, at - 100), at + needle.length + 300),
            href: `/meetings/${m.id}${part === "note" ? "#note-original" : ""}`,
          });
        }
      }
      const { segments } = await svc.transcript(m.id);
      const names = (m.speaker_map ?? {}) as Record<string, string>;
      for (const s of segments) {
        const text = `${s.speaker ? `${names[s.speaker] ?? s.speaker}: ` : ""}${s.text}`;
        if (text.toLocaleLowerCase().includes(needle))
          hits.push({
            ...base,
            part: "transcript",
            text,
            segmentId: s.id,
            startMs: s.start_ms,
            href: `/meetings/${m.id}?at=${s.start_ms}`,
          });
      }
    }
    if (rows.data.length < 100) break;
    page++;
  }
  const offset = input.offset ?? 0;
  const limit = input.limit ?? 10;
  const items = hits.slice(offset, offset + limit);
  const hasMore = offset + items.length < hits.length;
  return {
    items,
    total: hits.length,
    hasMore,
    nextOffset: hasMore ? offset + items.length : null,
  };
}
