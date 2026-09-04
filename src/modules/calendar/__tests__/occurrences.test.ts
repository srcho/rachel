import { describe, expect, it } from "vitest";
import { eventDays, expandOccurrences, occurrenceLabel } from "../occurrences";

const tz = "Asia/Seoul";
const ev = (
  id: string,
  start: string,
  end: string,
  allDay = false,
): {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
} => ({ id, title: id, start_at: start, end_at: end, all_day: allDay });

describe("expandOccurrences", () => {
  it("하루짜리 시각 일정은 하루에만", () => {
    const m = expandOccurrences(
      [ev("a", "2026-09-16T01:00:00Z", "2026-09-16T02:00:00Z")],
      "2026-09-01",
      "2026-10-01",
      tz,
    );
    expect([...m.keys()]).toEqual(["2026-09-16"]);
    expect(occurrenceLabel(m.get("2026-09-16")![0]!, tz)).toBe("10:00–11:00");
  });
  it("종일 하루짜리(배타적 종료 = 다음날 자정)는 그 날에만", () => {
    const e = ev("b", "2026-09-15T15:00:00Z", "2026-09-16T15:00:00Z", true); // 9/16 KST 종일
    expect(eventDays(e, tz)).toEqual({
      first: "2026-09-16",
      last: "2026-09-16",
    });
    const m = expandOccurrences([e], "2026-09-01", "2026-10-01", tz);
    expect([...m.keys()]).toEqual(["2026-09-16"]);
    expect(occurrenceLabel(m.get("2026-09-16")![0]!, tz)).toBe("종일");
  });
  it("사흘짜리 종일은 세 날 모두, 순번이 붙는다", () => {
    const e = ev("c", "2026-09-15T15:00:00Z", "2026-09-18T15:00:00Z", true); // 9/16~9/18
    const m = expandOccurrences([e], "2026-09-01", "2026-10-01", tz);
    expect([...m.keys()]).toEqual(["2026-09-16", "2026-09-17", "2026-09-18"]);
    expect(occurrenceLabel(m.get("2026-09-17")![0]!, tz)).toBe("종일 · 2/3일");
    expect(m.get("2026-09-18")![0]!.isEnd).toBe(true);
  });
  it("자정을 넘는 시각 일정은 이틀에, 라벨은 → 로", () => {
    const e = ev("d", "2026-09-16T14:00:00Z", "2026-09-16T16:00:00Z"); // 23:00~01:00 KST
    const m = expandOccurrences([e], "2026-09-01", "2026-10-01", tz);
    expect([...m.keys()]).toEqual(["2026-09-16", "2026-09-17"]);
    expect(occurrenceLabel(m.get("2026-09-16")![0]!, tz)).toBe("23:00 →");
    expect(occurrenceLabel(m.get("2026-09-17")![0]!, tz)).toBe("→ 01:00");
  });
  it("정확히 자정에 끝나는 일정은 다음날에 나타나지 않는다", () => {
    const e = ev("e", "2026-09-16T13:00:00Z", "2026-09-16T15:00:00Z"); // 22:00~24:00 KST
    const m = expandOccurrences([e], "2026-09-01", "2026-10-01", tz);
    expect([...m.keys()]).toEqual(["2026-09-16"]);
  });
  it("범위 전에 시작한 일정도 범위 안의 날에는 보인다", () => {
    const e = ev("f", "2026-08-30T00:00:00Z", "2026-09-02T00:00:00Z", true);
    const m = expandOccurrences([e], "2026-09-01", "2026-10-01", tz);
    expect([...m.keys()]).toEqual(["2026-09-01", "2026-09-02"]);
    expect(m.get("2026-09-01")![0]!.isStart).toBe(false);
  });
  it("같은 날 정렬: 종일 → 전날부터 이어지는 것 → 그 날 시작 시각순(자정 넘기는 첫날은 시각순)", () => {
    const m = expandOccurrences(
      [
        ev("late", "2026-09-16T05:00:00Z", "2026-09-16T06:00:00Z"), // 14:00
        ev("early", "2026-09-16T01:00:00Z", "2026-09-16T02:00:00Z"), // 10:00
        ev("overnight", "2026-09-16T14:00:00Z", "2026-09-16T16:00:00Z"), // 23:00 → 01:00
        ev("cont", "2026-09-14T23:00:00Z", "2026-09-17T01:00:00Z"), // 9/15 부터 이어짐
        ev("allday", "2026-09-15T15:00:00Z", "2026-09-16T15:00:00Z", true),
      ],
      "2026-09-16",
      "2026-09-17",
      tz,
    );
    expect(m.get("2026-09-16")!.map((o) => o.event.id)).toEqual([
      "allday",
      "cont",
      "early",
      "late",
      "overnight",
    ]);
  });
});
