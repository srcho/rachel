import type { ServiceContext } from "@/core/contracts";
import type { MeetingRow } from "./repository";
export async function meetingChanged(
  ctx: ServiceContext,
  meeting: MeetingRow,
  reason: string,
) {
  await ctx.emit({
    type: "meeting.changed",
    entity: { type: "meeting", id: meeting.id },
    payload: {
      version: meeting.content_version,
      reason,
      summaryText: meeting.summary_md ?? "",
    },
  });
}
