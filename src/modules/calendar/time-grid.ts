import type { Occurrence } from "./occurrences";
import type { EventRow } from "./repository";
export function layoutDay(items: Occurrence<EventRow>[], timezone: string) {
  const minute = (iso: string) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(iso));
    return (
      Number(parts.find((p) => p.type === "hour")?.value ?? 0) * 60 +
      Number(parts.find((p) => p.type === "minute")?.value ?? 0)
    );
  };
  const rows = items
    .filter((o) => !o.event.all_day)
    .map((o) => ({
      occurrence: o,
      start: o.isStart ? minute(o.event.start_at) : 0,
      end: o.isEnd ? minute(o.event.end_at) || 1440 : 1440,
      lane: 0,
      lanes: 1,
    }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  let group: typeof rows = [];
  let end = -1;
  const flush = () => {
    const lanes = Math.max(1, ...group.map((r) => r.lane + 1));
    for (const row of group) row.lanes = lanes;
    group = [];
  };
  for (const row of rows) {
    if (row.start >= end) flush();
    const occupied = new Set(
      group.filter((r) => r.end > row.start).map((r) => r.lane),
    );
    while (occupied.has(row.lane)) row.lane++;
    group.push(row);
    end = Math.max(...group.map((r) => r.end));
  }
  flush();
  return rows;
}
