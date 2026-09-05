import { localYmd, tzOffsetMs } from "@/core/utils/date";
import { addDays } from "./format";
import type { EventRow } from "./repository";
import { type FindFreeSlotsInput, findFreeSlotsSchema } from "./schema";

export function freeSlots(
  events: Pick<EventRow, "start_at" | "end_at" | "is_busy" | "status">[],
  input: FindFreeSlotsInput,
  now: Date,
  timezone: string,
) {
  const f = findFreeSlotsSchema.parse(input);
  const from = Math.max(Date.parse(f.from), now.getTime());
  const to = Date.parse(f.to);
  const need = f.durationMinutes * 60_000;
  const buffer = f.bufferMinutes * 60_000;
  const busy = events
    .filter((e) => e.is_busy && e.status !== "cancelled")
    .map(
      (e) =>
        [
          Date.parse(e.start_at) - buffer,
          Date.parse(e.end_at) + buffer,
        ] as const,
    )
    .sort((a, b) => a[0] - b[0]);
  const slots: Array<{ startAt: string; endAt: string }> = [];
  const localHour = (date: string, hour: number) => {
    const guess = new Date(`${date}T00:00:00Z`);
    guess.setUTCHours(hour);
    return guess.getTime() - tzOffsetMs(timezone, guess);
  };
  for (
    let date = localYmd(new Date(from), timezone);
    date <= localYmd(new Date(to), timezone) && slots.length < f.limit;
    date = addDays(date, 1)
  ) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (!f.includeWeekends && (weekday === 0 || weekday === 6)) continue;
    let cursor = Math.max(
      from,
      localHour(
        date,
        Math.max(f.workStartHour, f.preferredStartHour ?? f.workStartHour),
      ),
    );
    const end = Math.min(
      to,
      localHour(
        date,
        Math.min(f.workEndHour, f.preferredEndHour ?? f.workEndHour),
      ),
    );
    const add = (gapEnd: number) => {
      if (gapEnd - cursor >= need && slots.length < f.limit)
        slots.push({
          startAt: new Date(cursor).toISOString(),
          endAt: new Date(cursor + need).toISOString(),
        });
    };
    for (const [start, finish] of busy) {
      if (finish <= cursor) continue;
      if (start >= end) break;
      add(Math.min(start, end));
      cursor = Math.max(cursor, finish);
      if (cursor >= end || slots.length >= f.limit) break;
    }
    add(end);
  }
  return slots;
}
