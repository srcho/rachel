import { dayBounds, tzOffsetMs } from "@/core/utils/date";
import { parseDueFromTitle } from "@/modules/tasks/parse-due";
import type { MeetingSummary } from "./schema";

type ActionItem = MeetingSummary["actionItems"][number];

/** Based on the original action, never on the user's edited title or due date. */
export function meetingActionKey(meetingId: string, item: ActionItem): string {
  return JSON.stringify([
    "meeting",
    meetingId,
    item.title.trim(),
    item.owner ?? "",
    [...(item.sourceSeq ?? [])].sort((a, b) => a - b),
  ]);
}

export function meetingDue(
  due: string | undefined,
  startedAt: string,
  timezone: string,
) {
  if (!due?.trim()) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    const date = new Date(`${due}T12:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== due)
      return null;
    const noon = new Date(date.getTime() - tzOffsetMs(timezone, date));
    return {
      dueAt: new Date(
        Date.parse(dayBounds(noon, timezone).end) - 60_000,
      ).toISOString(),
      hasTime: false,
    };
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(due) && /(Z|[+-]\d{2}:\d{2})$/.test(due)) {
    const date = new Date(due);
    return Number.isNaN(date.getTime())
      ? null
      : { dueAt: date.toISOString(), hasTime: true };
  }
  return parseDueFromTitle(due, new Date(startedAt), timezone);
}
