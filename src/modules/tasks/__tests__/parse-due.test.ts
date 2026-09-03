import { describe, expect, it } from "vitest";
import { parseDueFromTitle } from "../parse-due";

const now = new Date("2026-09-03T01:00:00Z"); // 서울 목요일 10:00

describe("parseDueFromTitle (ko)", () => {
  it("parses 내일 + 시간", () => {
    const r = parseDueFromTitle("내일 3시 PRD 검토", now);
    expect(r?.dueAt).toBe("2026-09-04T06:00:00.000Z"); // 9/4 15:00 KST
    expect(r?.hasTime).toBe(true);
    expect(r?.title).toBe("PRD 검토");
  });
  it("parses 오늘 without time as end of day", () => {
    const r = parseDueFromTitle("오늘 장보기", now);
    expect(r?.dueAt).toBe("2026-09-03T14:59:00.000Z");
    expect(r?.hasTime).toBe(false);
    expect(r?.title).toBe("장보기");
  });
  it("parses 다음주 월요일 and 금요일", () => {
    expect(
      parseDueFromTitle("다음주 월 보고서", now)?.dueAt.startsWith(
        "2026-09-07",
      ),
    ).toBe(true);
    expect(
      parseDueFromTitle("금요일까지 정산", now)?.dueAt.startsWith("2026-09-04"),
    ).toBe(true);
    expect(parseDueFromTitle("금요일까지 정산", now)?.title).toBe("정산");
  });
  it("parses M/D, M월 D일, 오후 시각", () => {
    expect(
      parseDueFromTitle("9/12까지 세금", now)?.dueAt.startsWith("2026-09-12"),
    ).toBe(true);
    const r = parseDueFromTitle("10월 1일 오후 2시 치과", now);
    expect(r?.dueAt).toBe("2026-10-01T05:00:00.000Z");
    expect(r?.title).toBe("치과");
  });
  it("returns null when no date", () => {
    expect(parseDueFromTitle("그냥 할 일", now)).toBeNull();
  });
  it("falls back to english", () => {
    expect(
      parseDueFromTitle("call mom tomorrow", now)?.dueAt.startsWith(
        "2026-09-04",
      ),
    ).toBe(true);
  });
});
