import type { Indexer } from "@/core/contracts";
import { calendarRepository } from "./repository";

export const eventsIndexer: Indexer = {
  sourceType: "calendar_event",
  on: [
    "calendar_event.created",
    "calendar_event.updated",
    "calendar_event.deleted",
    "calendar.synced",
  ],
  chunks: async (id, ctx) => {
    const e = await calendarRepository(ctx.db, ctx.userId).getEvent(id);
    if (!e || e.deleted_at) return [];
    const when = new Date(e.start_at).toLocaleString("ko-KR", {
      timeZone: ctx.timezone,
      dateStyle: "medium",
      timeStyle: e.all_day ? undefined : "short",
    });
    const text = [
      e.title,
      when,
      e.location ? `장소: ${e.location}` : "",
      e.description ?? "",
    ]
      .filter(Boolean)
      .join("\n");
    return [
      {
        index: 0,
        content: text.slice(0, 2000),
        metadata: {
          title: e.title,
          href: `/calendar?view=agenda&date=${e.start_at.slice(0, 10)}`,
          startAt: e.start_at,
        },
      },
    ];
  },
};
