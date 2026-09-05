import { z } from "zod";
import { localYmd, tzOffsetMs } from "@/core/utils/date";
export const reminderSettingsSchema = z.object({
  quietStart: z.number().int().min(0).max(23),
  quietEnd: z.number().int().min(0).max(23),
  morningHour: z.number().int().min(0).max(23),
  calendarAlongsideGoogle: z.boolean(),
});
export const DEFAULT_REMINDERS = {
  quietStart: 22,
  quietEnd: 8,
  morningHour: 9,
  calendarAlongsideGoogle: false,
};
export function afterQuietHours(
  at: Date,
  timezone: string,
  start: number,
  end: number,
) {
  if (start === end) return at;
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(at),
  );
  const quiet =
    start < end ? hour >= start && hour < end : hour >= start || hour < end;
  if (!quiet) return at;
  const day = new Date(`${localYmd(at, timezone)}T12:00:00Z`);
  if (start > end && hour >= start) day.setUTCDate(day.getUTCDate() + 1);

  return wallClock(day.toISOString().slice(0, 10), end, timezone);
}
export function wallClock(date: string, hour: number, timezone: string) {
  const raw = new Date(`${date}T${String(hour).padStart(2, "0")}:00:00Z`);
  const first = new Date(raw.getTime() - tzOffsetMs(timezone, raw));
  return new Date(raw.getTime() - tzOffsetMs(timezone, first));
}
