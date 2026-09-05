import { expect, it } from "vitest";
import { expandOccurrences } from "../occurrences";
import type { EventRow } from "../repository";
import { layoutDay } from "../time-grid";

it("places overlapping events side by side and reuses width after the group ends", () => {
  const events = [
    ["a", 9, 11],
    ["b", 10, 12],
    ["c", 13, 14],
  ].map(([id, start, end]) => ({
    id,
    title: id,
    start_at: `2026-09-07T${String(start).padStart(2, "0")}:00:00+09:00`,
    end_at: `2026-09-07T${end}:00:00+09:00`,
    all_day: false,
  })) as EventRow[];
  const day =
    expandOccurrences(events, "2026-09-07", "2026-09-08", "Asia/Seoul").get(
      "2026-09-07",
    ) ?? [];
  const layout = layoutDay(day, "Asia/Seoul");
  expect(layout.map((r) => [r.lane, r.lanes])).toEqual([
    [0, 2],
    [1, 2],
    [0, 1],
  ]);
});
