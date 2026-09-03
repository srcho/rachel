import { describe, expect, it } from "vitest";
import { assembleTranscript, summaryToMarkdown } from "../postprocess";
import type { MeetingRow, SegmentRow } from "../repository";

const meeting = {
  speaker_map: { S1: "김민수" },
  bookmarks: [{ atMs: 20_000 }],
} as unknown as MeetingRow;
const seg = (start: number, text: string, speaker?: string) =>
  ({
    start_ms: start,
    end_ms: start + 5000,
    text,
    speaker: speaker ?? null,
  }) as SegmentRow;

describe("postprocess helpers", () => {
  it("assembles transcript with clock, speaker names and bookmarks", () => {
    const t = assembleTranscript(meeting, [
      seg(0, "안녕하세요", "S1"),
      seg(18_000, "예산 논의", "S2"),
      seg(60_000, "", "S1"),
    ]);
    expect(t.split("\n")).toEqual([
      "[0:00] 김민수: 안녕하세요",
      "[0:18] [중요] 화자 2: 예산 논의",
    ]);
  });
  it("renders summary markdown", () => {
    const md = summaryToMarkdown({
      tldr: "요약.",
      keyPoints: ["a"],
      decisions: [],
      actionItems: [
        { title: "PRD 검토", owner: "나", due: "9/5", sourceSeq: [] },
      ],
      openQuestions: [],
      participants: [],
      followups: [],
    });
    expect(md).toContain("**요약** 요약.");
    expect(md).toContain("- PRD 검토 — 나 (9/5)");
  });
});
