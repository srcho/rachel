import { type ToolSet, tool } from "ai";
import type { AnyAgentTool, ToolContext } from "@/core/contracts";
import type { Json } from "@/core/db/types.generated";
import { approvedContext, requestApproval } from "./approvals";
import { prepareExecutionInput, runToolOnce } from "./tool-once";

export interface AdaptedTools {
  tools: ToolSet;
  /** destructive 도구는 사용자 승인 */
  toolApproval: Record<
    string,
    | "user-approval"
    | ((
        input: unknown,
        options: { toolCallId: string },
      ) => Promise<"user-approval">)
  >;
}

/** OpenAI 도구 이름 규칙 ^[a-zA-Z0-9_-]+$ — 레지스트리의 'tasks.create' 는 'tasks_create' 로 노출한다 */
export function toAiToolName(registryName: string): string {
  return registryName.replace(/\./g, "_");
}

/**
 * 레지스트리 도구 → AI SDK tool(). ctx 는 클로저로 주입한다(요청마다 에이전트를 만든다).
 * write 도구의 결과에는 30초 되돌리기 토큰을 붙인다(토큰에는 레지스트리 이름을 저장).
 */
export function adaptTools(
  defs: Record<string, AnyAgentTool>,
  ctx: ToolContext,
  turnKey?: string,
  retry = false,
): AdaptedTools {
  const tools: AdaptedTools["tools"] = {};
  const toolApproval: AdaptedTools["toolApproval"] = {};
  for (const [name, def] of Object.entries(defs)) {
    const aiName = toAiToolName(name);
    if (def.risk === "destructive")
      toolApproval[aiName] = turnKey
        ? async (input, { toolCallId }) => {
            await requestApproval(
              ctx,
              turnKey,
              toolCallId,
              name,
              def.inputSchema.parse(input),
            );
            return "user-approval";
          }
        : "user-approval";
    tools[aiName] = tool({
      // Optional filters and patch fields must stay omitted; Zod validates execution.
      strict: false,
      description: def.description,
      inputSchema: def.inputSchema,
      execute: async (input: unknown, { toolCallId }) => {
        const validated = def.inputSchema.parse(input);
        const parsed = turnKey
          ? prepareExecutionInput(turnKey, name, validated)
          : validated;
        const execute = async () => {
          if (def.risk === "destructive" && !turnKey)
            throw new Error("승인할 요청을 찾을 수 없어요.");
          const executionCtx =
            def.risk === "destructive"
              ? await approvedContext(
                  ctx,
                  turnKey as string,
                  toolCallId,
                  name,
                  parsed,
                )
              : ctx;
          const output = await def.execute(parsed, executionCtx);
          if (def.risk === "write" && def.undo) {
            const undoId = await recordUndo(ctx, name, output);
            return { ...(output as object), _undo: undoId };
          }
          return output;
        };
        return turnKey && def.risk !== "read"
          ? runToolOnce(ctx, turnKey, name, parsed, execute, retry)
          : execute();
      },
    });
  }
  return { tools, toolApproval };
}

async function recordUndo(
  ctx: ToolContext,
  toolName: string,
  output: unknown,
): Promise<string | null> {
  const { data, error } = await ctx.db
    .from("undo_tokens")
    .insert({ user_id: ctx.userId, tool: toolName, output: output as Json })
    .select("id")
    .single();
  if (error) {
    console.error("[undo] 토큰 저장 실패", error.message);
    return null;
  }
  return data.id;
}

/** 되돌리기 실행. 만료(30초) 전이고 도구에 undo 가 있으면 실행하고 토큰을 지운다. */
export async function runUndo(
  defs: Record<string, AnyAgentTool>,
  ctx: ToolContext,
  undoId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await ctx.db
    .from("undo_tokens")
    .select("*")
    .eq("id", undoId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error || !data)
    return { ok: false, reason: "되돌리기 정보를 찾지 못했어요" };
  if (new Date(data.expires_at).getTime() < Date.now())
    return { ok: false, reason: "되돌리기 시간이 지났어요(30초)" };
  const def = defs[data.tool];
  if (!def?.undo) return { ok: false, reason: "되돌릴 수 없는 작업이에요" };
  const claim = await ctx.db
    .from("undo_tokens")
    .delete()
    .eq("id", undoId)
    .eq("user_id", ctx.userId)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (claim.error) throw claim.error;
  if (!claim.data)
    return { ok: false, reason: "이미 처리했거나 만료된 되돌리기예요" };
  try {
    await def.undo(data.output, ctx);
  } catch (e) {
    return {
      ok: false,
      reason:
        e instanceof Error
          ? e.message
          : "되돌린 결과를 확인하지 못했어요. 원본 상태를 확인해 주세요.",
    };
  }
  return { ok: true };
}
