import { describe, expect, it } from "vitest";
import type { CalendarRow } from "../repository";
import { toRow } from "../sync";

const cal = { id: "c1", external_id: "primary" } as CalendarRow;

describe("toRow", () => {
  it("maps timed events", () => {
    const r = toRow(cal, {
      id: "e1",
      summary: "주간 싱크",
      start: { dateTime: "2026-09-04T10:00:00+09:00", timeZone: "Asia/Seoul" },
      end: { dateTime: "2026-09-04T11:00:00+09:00" },
      etag: '"1"',
    });
    expect(r).toMatchObject({
      external_id: "e1",
      title: "주간 싱크",
      all_day: false,
      start_at: "2026-09-04T01:00:00.000Z",
      end_at: "2026-09-04T02:00:00.000Z",
      sync_status: "synced",
      deleted_at: null,
    });
  });
  it("maps all-day events at calendar-zone midnight and cancelled as deleted", () => {
    const r = toRow(cal, {
      id: "e2",
      start: { date: "2026-09-05" },
      end: { date: "2026-09-06" },
      status: "cancelled",
    });
    expect(r.all_day).toBe(true);
    expect(r.start_at).toBe("2026-09-04T15:00:00.000Z");
    expect(r.title).toBe("(제목 없음)");
    expect(r.deleted_at).not.toBeNull();
  });
});
