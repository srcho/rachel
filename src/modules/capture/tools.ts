import { z } from "zod";
import { type AnyAgentTool, defineTool } from "@/core/contracts";
import { captureService } from "./service";

export const captureTools: Record<string, AnyAgentTool> = {
  add: defineTool({
    description:
      "사용자가 '이거 적어 둬', '나중에 정리할게' 처럼 분류 없이 던지는 메모를 인박스에 넣는다. 분류는 레이첼이 나중에 제안한다.",
    inputSchema: z.object({ text: z.string().min(1).max(4000) }),
    risk: "write",
    execute: async ({ text }, ctx) => {
      const c = await captureService(ctx).add({ text, origin: "text" });
      return { id: c.id, text: c.raw_text };
    },
    undo: async (output, ctx) => {
      await captureService(ctx).dismiss(output.id);
    },
  }),
  list: defineTool({
    description: "인박스(미처리 캡처) 목록과 분류 제안.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(50).default(20),
    }),
    risk: "read",
    execute: async ({ limit }, ctx) =>
      (await captureService(ctx).list("open", limit)).map((c) => ({
        id: c.id,
        text: c.raw_text,
        origin: c.origin,
        status: c.status,
        triage: c.triage,
      })),
  }),
  resolve: defineTool({
    description:
      "인박스 항목의 제안을 확정해 할 일/일정/기억으로 만든다. 사용자가 항목을 지목했을 때.",
    inputSchema: z.object({ id: z.string().uuid() }),
    risk: "write",
    execute: async ({ id }, ctx) => captureService(ctx).resolve(id),
  }),
  dismiss: defineTool({
    description: "인박스 항목을 무시(정리)한다.",
    inputSchema: z.object({ id: z.string().uuid() }),
    risk: "write",
    execute: async ({ id }, ctx) => {
      await captureService(ctx).dismiss(id);
      return { id };
    },
  }),
};
