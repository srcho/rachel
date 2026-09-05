export interface ResultLink {
  href: string;
  title: string;
  detail?: string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
/** Only service results supply entity IDs. Never derive a link from assistant prose. */
export function resultLinks(name: string, output: unknown): ResultLink[] {
  if (/delete|forget|dismiss/.test(name)) return [];
  const container = record(output);
  const rows = Array.isArray(output)
    ? output
    : Array.isArray(container?.events)
      ? container.events
      : Array.isArray(container?.items)
        ? container.items
        : Array.isArray(container?.results)
          ? container.results
          : Array.isArray(container?.cards)
            ? container.cards
            : [output];
  if (name === "system_export")
    return [{ href: "/api/export", title: "내 데이터 내려받기" }];
  return rows.flatMap((value): ResultLink[] => {
    const row = record(value);
    if (!row || typeof row.id !== "string" || !uuid.test(row.id)) return [];
    const title =
      typeof row.title === "string"
        ? row.title
        : typeof row.content === "string"
          ? row.content
          : "결과 열기";
    if (
      name.startsWith("tasks_") &&
      typeof row.boardId === "string" &&
      uuid.test(row.boardId)
    )
      return [
        {
          href: `/tasks/${row.boardId}?card=${row.id}`,
          title,
          detail:
            row.completed === true
              ? "완료"
              : typeof row.due === "string"
                ? `마감 ${row.due.slice(0, 10)}`
                : undefined,
        },
      ];
    if (name.startsWith("calendar_") && typeof row.calendarId === "string")
      return [
        {
          href: `/calendar?event=${row.id}`,
          title,
          detail:
            row.syncStatus === "synced"
              ? "Google 반영됨"
              : row.syncStatus === "conflict"
                ? "Google 변경 비교 필요"
                : "Google 반영 대기",
        },
      ];
    if (name.startsWith("capture_"))
      return [{ href: `/capture/${row.id}`, title }];
    if (
      name === "meetings_reviewActionItems" ||
      name === "meetings_createTasksFromActionItems"
    )
      return typeof row.href === "string" &&
        /^\/(tasks\/[0-9a-f-]+\?card=[0-9a-f-]+|calendar\?event=[0-9a-f-]+|meetings\/[0-9a-f-]+)$/i.test(
          row.href,
        )
        ? [{ href: row.href, title }]
        : [];
    if (name.startsWith("meetings_"))
      return [{ href: `/meetings/${row.id}`, title }];
    if (name.startsWith("memory_") && name !== "memory_searchAll")
      return [
        {
          href: `/memory?id=${row.id}#memory-${row.id}`,
          title,
          detail: row.needsReview ? "이전 기억과 비교·확인" : "기억 확인·정정",
        },
      ];
    if (
      name === "memory_searchAll" &&
      typeof row.href === "string" &&
      /^\/(tasks|calendar|meetings|memory|capture)(\/|\?|$)/.test(row.href)
    )
      return [{ href: row.href, title }];
    return [];
  });
}
