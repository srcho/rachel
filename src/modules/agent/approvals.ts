import { createHash } from "node:crypto";
import type { ToolContext } from "@/core/contracts";
import type { Json } from "@/core/db/types.generated";
import { toolPreview } from "./preview";

export function canonicalInput(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalInput).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalInput(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export async function requestApproval(
  ctx: ToolContext,
  turnKey: string,
  callId: string,
  name: string,
  input: unknown,
) {
  const existing = await findApproval(ctx, callId);
  if (existing) {
    if (
      existing.turn_key !== turnKey ||
      existing.tool_name !== name ||
      canonicalInput(existing.input) !== canonicalInput(input)
    )
      throw new Error(
        "승인한 작업과 요청 내용이 달라요. 새 변경안을 확인해 주세요.",
      );
    return;
  }
  const preview = await toolPreview(ctx, name.replace(".", "_"), input);
  const { error } = await ctx.db.from("agent_tool_approvals").insert({
    user_id: ctx.userId,
    turn_key: turnKey,
    tool_call_id: callId,
    tool_name: name,
    input: JSON.parse(canonicalInput(input)) as Json,
    preview: preview as unknown as Json,
    targets: preview.targets as Json,
  });
  if (error) throw error;
}

async function findApproval(ctx: ToolContext, callId: string) {
  const { data, error } = await ctx.db
    .from("agent_tool_approvals")
    .select("*")
    .eq("user_id", ctx.userId)
    .eq("tool_call_id", callId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function approvalPreview(ctx: ToolContext, callId: string) {
  const row = await findApproval(ctx, callId);
  if (!row || Date.parse(row.expires_at) <= Date.now())
    throw new Error("변경안이 만료됐어요. 다시 요청해 주세요.");
  return row.preview as unknown as Awaited<ReturnType<typeof toolPreview>>;
}

async function verifyTargets(
  ctx: ToolContext,
  row: NonNullable<Awaited<ReturnType<typeof findApproval>>>,
) {
  const current = await toolPreview(
    ctx,
    row.tool_name.replace(".", "_"),
    row.input,
  );
  const sorted = (targets: unknown) =>
    canonicalInput(
      (targets as Array<{ id: string }>).toSorted((a, b) =>
        a.id.localeCompare(b.id),
      ),
    );
  if (sorted(current.targets) !== sorted(row.targets))
    throw new Error(
      "확인한 뒤 대상이 바뀌었어요. 최신 내용을 다시 확인해 주세요.",
    );
  return Object.fromEntries(
    current.targets.map((t) => [`${t.table}:${t.id}`, t.version]),
  );
}

export async function respondToApproval(
  ctx: ToolContext,
  callId: string,
  approved: boolean,
) {
  const row = await findApproval(ctx, callId);
  if (!row || Date.parse(row.expires_at) <= Date.now())
    throw new Error("변경안이 만료됐어요. 다시 요청해 주세요.");
  const status = approved ? "approved" : "rejected";
  if (row.status === status) return;
  if (row.status !== "pending") throw new Error("이미 처리한 승인 요청이에요.");
  if (approved) await verifyTargets(ctx, row);
  const { data, error } = await ctx.db
    .from("agent_tool_approvals")
    .update({ status })
    .eq("user_id", ctx.userId)
    .eq("id", row.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("승인 상태가 바뀌었어요. 다시 확인해 주세요.");
}

export async function approvedContext(
  ctx: ToolContext,
  turnKey: string,
  callId: string,
  name: string,
  input: unknown,
): Promise<ToolContext> {
  const row = await findApproval(ctx, callId);
  if (
    !row ||
    row.status !== "approved" ||
    row.turn_key !== turnKey ||
    row.tool_name !== name ||
    canonicalInput(row.input) !== canonicalInput(input) ||
    Date.parse(row.expires_at) <= Date.now()
  )
    throw new Error("이 변경에 대한 유효한 승인이 필요해요.");
  return { ...ctx, approvedVersions: await verifyTargets(ctx, row) };
}

export function approvalSecret(
  serverSecret: string,
  userId: string,
  threadId: string,
) {
  return createHash("sha256")
    .update(`${serverSecret}:rachel-approval:${userId}:${threadId}`)
    .digest("hex");
}
