import { describe, expect, it } from "vitest";
import { dayBounds, localYmd } from "../date";

describe("dayBounds", () => {
  it("returns Seoul midnight boundaries in UTC", () => {
    const now = new Date("2026-09-03T01:00:00Z"); // 서울 10:00
    expect(localYmd(now, "Asia/Seoul")).toBe("2026-09-03");
    expect(dayBounds(now, "Asia/Seoul")).toEqual({
      start: "2026-09-02T15:00:00.000Z",
      end: "2026-09-03T15:00:00.000Z",
    });
  });
  it("handles date rollover near midnight and offsets", () => {
    const now = new Date("2026-09-03T15:30:00Z"); // 서울 9/4 00:30
    expect(dayBounds(now, "Asia/Seoul").start).toBe("2026-09-03T15:00:00.000Z");
    expect(dayBounds(now, "Asia/Seoul", 7).start).toBe(
      "2026-09-10T15:00:00.000Z",
    );
    expect(
      dayBounds(new Date("2026-03-08T12:00:00Z"), "America/New_York"),
    ).toEqual({
      start: "2026-03-08T05:00:00.000Z",
      end: "2026-03-09T04:00:00.000Z",
    });
  });
});
