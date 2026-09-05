import { expect, it } from "vitest";
import { addDays, startOfMonth, startOfWeek } from "../format";

it.each([
  ["2026-09-05", "2026-08-30"],
  ["2026-11-12", "2026-11-01"],
  ["2026-06-15", "2026-05-31"],
  ["2027-01-10", "2026-12-27"],
  ["2024-02-29", "2024-01-28"],
])("월간 %s의 첫 칸은 일요일 %s", (date, expected) => {
  const start = startOfWeek(startOfMonth(date), 0);
  expect(start).toBe(expected);
  expect(new Date(`${addDays(start, 41)}T00:00:00Z`).getUTCDay()).toBe(6);
});

it("주간은 월요일 시작을 유지하고 일요일은 이전 주에 속한다", () => {
  expect(startOfWeek("2026-09-06")).toBe("2026-08-31");
  expect(startOfWeek("2026-09-07")).toBe("2026-09-07");
  expect(startOfWeek("2026-09-06", 0)).toBe("2026-09-06");
});
