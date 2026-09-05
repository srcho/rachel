import { gzipSync } from "node:zlib";
import type { ServiceContext } from "@/core/contracts";

/** 사용자 데이터 전량(JSON). 테이블 추가 시 여기에 한 줄. */
const TABLES = [
  "profiles",
  "boards",
  "board_columns",
  "cards",
  "integrations",
  "calendars",
  "calendar_events",
  "meetings",
  "transcript_segments",
  "chat_threads",
  "chat_messages",
  "memories",
  "captures",
  "insights",
  "llm_usage",
  "push_subscriptions",
  "domain_events",
  "agent_tool_runs",
  "agent_tool_approvals",
  "assistant_suggestions",
  "assistant_preference_corrections",
  "notification_controls",
  "notification_deliveries",
] as const;

export async function buildExport(
  ctx: ServiceContext,
): Promise<{ json: string; counts: Record<string, number> }> {
  const out: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const col = t === "profiles" ? "id" : "user_id";
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await (ctx.db
        .from(t)
        .select("*")
        .filter(col, "eq", ctx.userId)
        .order(t === "notification_controls" ? "user_id" : "id")
        .range(from, from + 999) as unknown as Promise<{
        data: unknown[] | null;
        error: { message: string } | null;
      }>);
      if (error) throw new Error(`${t}: ${error.message}`);
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    // 임베딩 벡터는 크기만 크고 재생성 가능 → 제외
    out[t] = rows.map((r) => {
      const { embedding: _e, ...rest } = r as Record<string, unknown>;
      return rest;
    });
    counts[t] = rows.length;
  }
  const json = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      userId: ctx.userId,
      version: 1,
      tables: out,
    },
    null,
    0,
  );
  return { json, counts };
}

export function gzip(json: string): Buffer {
  return gzipSync(Buffer.from(json, "utf8"));
}
