import type { ComponentType } from "react";
import type { ZodType } from "zod";
import type { ToolContext } from "./context";

export type ToolRisk = "read" | "write" | "destructive";
export type ToolRenderState = "running" | "done" | "error";

export interface AgentTool<I = unknown, O = unknown> {
  description: string;
  inputSchema: ZodType<I>;
  /** read: 즉시 · write: 즉시 + 30초 되돌리기 · destructive: 승인 후 실행 */
  risk: ToolRisk;
  execute(input: I, ctx: ToolContext): Promise<O>;
  undo?(output: O, ctx: ToolContext): Promise<void>;
  Render?: ComponentType<{ input: I; output?: O; state: ToolRenderState }>;
}

// biome-ignore lint/suspicious/noExplicitAny: 도구 맵은 입력·출력 타입이 제각각이다
export type AnyAgentTool = AgentTool<any, any>;

/** 입력·출력 타입을 추론하기 위한 헬퍼. `tools: { create: defineTool({...}) }` */
export function defineTool<I, O>(tool: AgentTool<I, O>): AgentTool<I, O> {
  return tool;
}
