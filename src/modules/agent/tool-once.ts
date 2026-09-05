import { createHash } from "node:crypto";
import type { ToolContext } from "@/core/contracts";
import type { Json } from "@/core/db/types.generated";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

/** Retrying one chat turn reuses completed writes. An uncertain write requires inspection. */
export async function runToolOnce(
  ctx: ToolContext,
  turnKey: string,
  name: string,
  input: unknown,
  execute: () => Promise<unknown>,
  cachedOnly = false,
) {
  const requestKey = createHash("sha256")
    .update(canonical([turnKey, name, input]))
    .digest("hex");
  if (cachedOnly) {
    const previous = await ctx.db
      .from("agent_tool_runs")
      .select("status,output")
      .eq("user_id", ctx.userId)
      .eq("request_key", requestKey)
      .maybeSingle();
    if (previous.error) throw previous.error;
    if (previous.data?.status === "done") return previous.data.output;
    throw new Error(
      "응답 재시도 중에는 확인되지 않은 변경을 새로 실행하지 않아요. 목록을 확인한 뒤 필요한 변경을 새 요청으로 보내 주세요.",
    );
  }
  const { data, error } = await ctx.db
    .from("agent_tool_runs")
    .insert({ user_id: ctx.userId, request_key: requestKey })
    .select("id")
    .single();
  if (error) {
    if (error.code !== "23505") throw error;
    const previous = await ctx.db
      .from("agent_tool_runs")
      .select("status,output")
      .eq("user_id", ctx.userId)
      .eq("request_key", requestKey)
      .single();
    if (previous.error) throw previous.error;
    if (previous.data.status === "done") return previous.data.output;
    throw new Error(
      "이 요청의 이전 변경 결과를 확인해야 해요. 해당 목록을 확인한 뒤 필요한 변경만 새로 요청해 주세요.",
    );
  }
  try {
    const output = await execute();
    const saved = await ctx.db
      .from("agent_tool_runs")
      .update({ status: "done", output: (output ?? null) as Json })
      .eq("id", data.id)
      .eq("user_id", ctx.userId);
    if (saved.error) throw saved.error;
    return output;
  } catch (error) {
    await ctx.db
      .from("agent_tool_runs")
      .update({ status: "uncertain" })
      .eq("id", data.id)
      .eq("user_id", ctx.userId);
    throw error;
  }
}
