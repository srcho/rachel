import type { ToolContext } from "@/core/contracts";
import { getProfileSettings } from "@/core/settings/profile";
import { fmtDateTime } from "@/core/utils/date";
import { threadDeletionVersion } from "./repository";

const fields: Record<string, [string, string]> = {
  title: ["제목", "title"],
  description: ["설명", "description_md"],
  priority: ["우선순위", "priority"],
  dueAt: ["마감", "due_at"],
  planDate: ["하기로 한 날", "plan_date"],
  dueHasTime: ["마감 시각 사용", "due_has_time"],
  labels: ["라벨", "labels"],
  startAt: ["시작", "start_at"],
  endAt: ["종료", "end_at"],
  location: ["장소", "location"],
  allDay: ["종일", "all_day"],
  isBusy: ["시간을 비워 둠", "is_busy"],
};
export async function toolPreview(
  ctx: ToolContext,
  name: string,
  raw: unknown,
) {
  const registryName = name.replace("_", ".");
  const def = ctx.registry.tools()[registryName];
  if (!def || def.risk === "read")
    throw new Error("변경할 작업을 찾을 수 없어요");
  const input = def.inputSchema.parse(raw) as Record<string, unknown>;
  const ids = Array.isArray(input.ids)
    ? (input.ids as string[])
    : typeof input.id === "string"
      ? [input.id]
      : [];
  const table = name.startsWith("tasks_")
    ? "cards"
    : name.startsWith("calendar_")
      ? "calendar_events"
      : name.startsWith("meetings_")
        ? "meetings"
        : name.startsWith("memory_")
          ? "memories"
          : name.startsWith("capture_")
            ? "captures"
            : name.startsWith("agent_")
              ? "chat_threads"
              : null;
  if (!table) throw new Error("변경 미리보기를 지원하지 않는 작업이에요");
  const { data, error } = await ctx.db
    .from(table)
    .select("*")
    .eq("user_id", ctx.userId)
    .in("id", ids);
  if (error) throw error;
  if (new Set(ids).size !== data.length)
    throw new Error("일부 대상이 없어졌어요. 다시 요청해 주세요.");
  const patch = (input.patch ?? {}) as Record<string, unknown>;
  const format = (key: string, value: unknown): string => {
    if (value === undefined || value === null || value === "") return "없음";
    if (typeof value === "boolean") return value ? "사용" : "사용 안 함";
    if (Array.isArray(value)) return value.join(", ") || "없음";
    if (
      ["dueAt", "startAt", "endAt"].includes(key) &&
      typeof value === "string"
    )
      return fmtDateTime(value, ctx.timezone);
    return String(value);
  };
  const google =
    name.startsWith("calendar_") ||
    (name.startsWith("tasks_") &&
      Boolean((await getProfileSettings(ctx.db, ctx.userId)).gtasks?.enabled));
  return {
    targets: data.map((value) => {
      const row = value as Record<string, unknown>;
      return {
        table,
        id: String(row.id),
        version:
          name === "agent_deleteThread"
            ? threadDeletionVersion({
                created_at: String(row.created_at),
                title: row.title as string | null,
              })
            : String(
                row.content_version ??
                  row.updated_at ??
                  row.last_message_at ??
                  row.created_at,
              ),
      };
    }),
    count: data.length,
    google,
    undo: Boolean(def.undo),
    rows: data.map((value) => {
      const row = value as Record<string, unknown>;
      return {
        title: String(row.title ?? row.content ?? row.raw_text ?? "대상"),
        changes: Object.entries(patch).map(([key, after]) => {
          const [label, column] = fields[key] ?? [key, key];
          return {
            label,
            before: format(key, row[column]),
            after: format(key, after),
          };
        }),
        action:
          name.endsWith("delete") ||
          name.endsWith("deleteEvent") ||
          name.endsWith("deleteThread") ||
          name.endsWith("forget")
            ? "영구 삭제"
            : "변경",
      };
    }),
  };
}
