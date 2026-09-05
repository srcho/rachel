import { createHash } from "node:crypto";
import type { ToolContext } from "@/core/contracts";
import type { Json } from "@/core/db/types.generated";

export function canonicalExecutionInput(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(canonicalExecutionInput).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => `${JSON.stringify(key)}:${canonicalExecutionInput(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function executionRequestKey(
  turnKey: string,
  name: string,
  input: unknown,
) {
  return createHash("sha256")
    .update(canonicalExecutionInput([turnKey, name, input]))
    .digest("hex");
}

/** The same server turn and command always use the same resource creation key. */
export function prepareExecutionInput(
  turnKey: string,
  name: string,
  input: unknown,
) {
  if (
    (name === "tasks.create" || name === "calendar.createEvent") &&
    input &&
    typeof input === "object" &&
    !Array.isArray(input)
  ) {
    const values = input as Record<string, unknown>;
    if (!values.creationKey)
      return {
        ...values,
        creationKey: `agent:${executionRequestKey(turnKey, name, input)}`,
      };
  }
  if (
    (name === "meetings.createNote" || name === "capture.add") &&
    input &&
    typeof input === "object" &&
    !Array.isArray(input)
  ) {
    const values = input as Record<string, unknown>;
    if (!values.id) {
      const key = executionRequestKey(turnKey, name, input);
      return {
        ...values,
        id: `${key.slice(0, 8)}-${key.slice(8, 12)}-4${key.slice(13, 16)}-8${key.slice(17, 20)}-${key.slice(20, 32)}`,
      };
    }
  }
  return input;
}

function receiptError(id: string, status: string) {
  return new Error(
    `이 요청의 이전 변경 결과를 확인해야 해요. agent.getExecution 또는 agent.reconcileExecution으로 실행 기록 ${id}를 확인해 주세요. 상태: ${status}. 같은 변경을 새 요청으로 반복하지 마세요.`,
  );
}

/** Writes survive stream interruption. Retrying returns a receipt, never another uncertain write. */
export async function runToolOnce(
  ctx: ToolContext,
  turnKey: string,
  name: string,
  input: unknown,
  execute: () => Promise<unknown>,
  cachedOnly = false,
) {
  const requestKey = executionRequestKey(turnKey, name, input);
  const find = async () => {
    const previous = await ctx.db
      .from("agent_tool_runs")
      .select("id,status,output")
      .eq("user_id", ctx.userId)
      .eq("request_key", requestKey)
      .maybeSingle();
    if (previous.error) throw previous.error;
    return previous.data;
  };
  if (
    cachedOnly &&
    (name === "agent.reconcileExecution" || name === "agent.resumeExecution")
  ) {
    const receiptId =
      input && typeof input === "object"
        ? (input as { id?: unknown }).id
        : undefined;
    if (typeof receiptId !== "string")
      throw new Error("재개할 실행 기록을 확인해 주세요");
    const target = await ctx.db
      .from("agent_tool_runs")
      .select("turn_key")
      .eq("user_id", ctx.userId)
      .eq("id", receiptId)
      .maybeSingle();
    if (target.error) throw target.error;
    if (target.data?.turn_key !== turnKey)
      throw new Error(
        "응답 재시도 중에는 이번 요청의 실행 기록만 복구할 수 있어요",
      );
    cachedOnly = false;
  }
  if (cachedOnly) {
    const previous = await find();
    if (previous?.status === "done") return previous.output;
    if (previous) throw receiptError(previous.id, previous.status);
    throw new Error(
      "응답 재시도 중에는 확인되지 않은 변경을 새로 실행하지 않아요. agent.listExecutions에서 완료/미완료 기록을 확인해 주세요.",
    );
  }
  const { data, error } = await ctx.db
    .from("agent_tool_runs")
    .insert({
      user_id: ctx.userId,
      request_key: requestKey,
      turn_key: turnKey,
      thread_id: ctx.latestUserMessage?.threadId ?? null,
      tool_name: name,
      input: input as Json,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code !== "23505") throw error;
    const previous = await find();
    if (previous?.status === "done") return previous.output;
    throw receiptError(
      previous?.id ?? requestKey,
      previous?.status ?? "uncertain",
    );
  }
  try {
    const output = await execute();
    const saved = await ctx.db
      .from("agent_tool_runs")
      .update({
        status: "done",
        output: (output ?? null) as Json,
        error_message: null,
      })
      .eq("id", data.id)
      .eq("user_id", ctx.userId);
    if (saved.error) throw saved.error;
    return output;
  } catch (error) {
    const saved = await ctx.db
      .from("agent_tool_runs")
      .update({
        status: "uncertain",
        error_message:
          error instanceof Error
            ? error.message.slice(0, 1000)
            : "실행 결과를 확인하지 못했어요",
      })
      .eq("id", data.id)
      .eq("user_id", ctx.userId)
      .neq("status", "done");
    if (saved.error)
      console.error("[agent.execution] receipt update failed", {
        id: data.id,
        code: saved.error.code,
      });
    throw error;
  }
}
