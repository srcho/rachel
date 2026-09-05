import { describe, expect, it } from "vitest";
import { freeSlots } from "../free-slots";

const now = new Date("2026-09-01T00:00:00Z");
const base = {
  from: "2026-09-04T09:00:00+09:00",
  to: "2026-09-04T19:00:00+09:00",
  durationMinutes: 60,
};
const event = (start_at: string, end_at: string, is_busy = true) => ({
  start_at,
  end_at,
  is_busy,
  status: "confirmed",
});
describe("availability boundaries", () => {
  it("never offers a slot ending after the requested range", () => {
    expect(
      freeSlots(
        [],
        { ...base, from: "2026-09-04T18:30:00+09:00" },
        now,
        "Asia/Seoul",
      ),
    ).toEqual([]);
    expect(
      freeSlots(
        [],
        { ...base, to: "2026-09-04T09:30:00+09:00" },
        now,
        "Asia/Seoul",
      ),
    ).toEqual([]);
  });
  it("blocks all-day leave but lets transparent all-day reminders coexist", () => {
    const leave = event(
      "2026-09-04T00:00:00+09:00",
      "2026-09-05T00:00:00+09:00",
    );
    expect(freeSlots([leave], base, now, "Asia/Seoul")).toEqual([]);
    expect(
      freeSlots([{ ...leave, is_busy: false }], base, now, "Asia/Seoul"),
    ).toHaveLength(1);
  });
  it("merges overlaps and respects travel buffer, work hours and explicit preferences", () => {
    const events = [
      event("2026-09-04T09:00:00+09:00", "2026-09-04T10:00:00+09:00"),
      event("2026-09-04T09:30:00+09:00", "2026-09-04T11:00:00+09:00"),
    ];
    const slots = freeSlots(
      events,
      {
        ...base,
        bufferMinutes: 15,
        preferredStartHour: 11,
        preferredEndHour: 15,
      },
      now,
      "Asia/Seoul",
    );
    expect(slots[0]?.startAt).toBe("2026-09-04T02:15:00.000Z");
    expect(
      slots.every(
        (s) => Date.parse(s.endAt) <= Date.parse("2026-09-04T15:00:00+09:00"),
      ),
    ).toBe(true);
  });
  it("skips weekends unless requested and never skips the last short day", () => {
    expect(
      freeSlots(
        [],
        {
          ...base,
          from: "2026-09-05T09:00:00+09:00",
          to: "2026-09-05T19:00:00+09:00",
        },
        now,
        "Asia/Seoul",
      ),
    ).toEqual([]);
    const slots = freeSlots(
      [],
      {
        ...base,
        from: "2026-09-04T18:30:00+09:00",
        to: "2026-09-05T10:00:00+09:00",
        includeWeekends: true,
      },
      now,
      "Asia/Seoul",
    );
    expect(slots[0]?.startAt).toBe("2026-09-05T00:00:00.000Z");
  });
  it("uses wall-clock work hours across daylight saving changes", () => {
    const slots = freeSlots(
      [],
      {
        from: "2026-10-31T18:30:00-04:00",
        to: "2026-11-01T10:00:00-05:00",
        durationMinutes: 60,
        includeWeekends: true,
      },
      now,
      "America/New_York",
    );
    expect(slots[0]?.startAt).toBe("2026-11-01T14:00:00.000Z");
  });
});
