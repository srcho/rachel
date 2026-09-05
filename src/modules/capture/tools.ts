import { z } from "zod";
import { type AnyAgentTool, defineTool } from "@/core/contracts";
import { captureListSchema, triageSchema } from "./schema";
import { type CaptureRow, captureService } from "./service";

function view(c: CaptureRow) {
  return {
    id: c.id,
    text: c.raw_text,
    origin: c.origin,
    url: c.url,
    status: c.status,
    triage: c.triage,
    resolvedRef: c.resolved_ref,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    href: `/capture/${c.id}`,
  };
}
const idSchema = z.object({ id: z.string().uuid() });

export const captureTools: Record<string, AnyAgentTool> = {
  add: defineTool({
    description:
      "분류 없이 남기는 메모를 수집함에 넣는다. 분류는 나중에 제안한다.",
    inputSchema: z.object({
      id: z.string().uuid().optional(),
      text: z.string().min(1).max(4000),
    }),
    risk: "write",
    execute: async ({ id, text }, ctx) =>
      view(await captureService(ctx).add({ id, text })),
    undo: async (output, ctx) => {
      await captureService(ctx).dismiss(output.id);
    },
  }),
  list: defineTool({
    description:
      "수집함을 상태·원문 검색어로 조회한다. 처리한 메모는 status=resolved 또는 all. hasMore이면 nextOffset으로 계속 읽는다.",
    inputSchema: captureListSchema,
    risk: "read",
    execute: async (input, ctx) => {
      const page = await captureService(ctx).listPage(input);
      return { ...page, items: page.items.map(view) };
    },
  }),
  get: defineTool({
    description:
      "처리 여부에 관계없이 메모 원문·제안·결과 링크·수정 버전을 읽는다.",
    inputSchema: idSchema,
    risk: "read",
    execute: async ({ id }, ctx) => {
      const row = await captureService(ctx).get(id);
      return row ? view(row) : null;
    },
  }),
  edit: defineTool({
    description:
      "수집함 원문을 수정한다. get의 updatedAt을 expectedVersion으로 전달. 미처리 제안은 초기화되며 이미 만든 할 일/일정/기억은 연결된 원본에서 수정한다.",
    inputSchema: idSchema.extend({
      text: z.string().trim().min(1).max(4000),
      expectedVersion: z.string(),
    }),
    risk: "write",
    execute: async ({ id, text, expectedVersion }, ctx) =>
      view(await captureService(ctx).edit(id, text, expectedVersion)),
  }),
  retriage: defineTool({
    description:
      "미처리 메모 원문을 다시 분류한다. 확정하거나 새 자원을 생성하지 않는다.",
    inputSchema: idSchema,
    risk: "write",
    execute: async ({ id }, ctx) => ({
      id,
      triage: await captureService(ctx).triage(id),
    }),
  }),
  resolve: defineTool({
    description:
      "사용자가 지목한 메모를 할 일/일정/기억/참고 메모로 확정한다. override로 분류·제목·기한을 교정한다. 확정 중 재시도는 기존 제안을 유지해 생성 여부를 대조하며 중복 생성하지 않는다.",
    inputSchema: idSchema.extend({
      override: triageSchema.partial().optional(),
    }),
    risk: "write",
    execute: async ({ id, override }, ctx) =>
      captureService(ctx).resolve(id, override),
  }),
  dismiss: defineTool({
    description:
      "미처리 메모를 무시한다. changed=false이면 새로 정리됐다고 보고하지 않는다.",
    inputSchema: idSchema,
    risk: "write",
    execute: async ({ id }, ctx) => captureService(ctx).dismiss(id),
  }),
  restore: defineTool({
    description:
      "처리/무시한 메모를 같은 ID로 수집함에 복원한다. 이미 생성된 자원 링크는 유지하며 재확정해도 중복 생성하지 않는다.",
    inputSchema: idSchema,
    risk: "write",
    execute: async ({ id }, ctx) => captureService(ctx).restore(id),
  }),
  delete: defineTool({
    description:
      "수집함 메모를 영구 삭제한다. 이미 만들어진 할 일/일정/기억은 유지한다. get의 updatedAt을 expectedVersion으로 전달한다.",
    inputSchema: idSchema.extend({ expectedVersion: z.string() }),
    risk: "destructive",
    execute: async ({ id, expectedVersion }, ctx) =>
      captureService(ctx).remove(id, expectedVersion),
  }),
};
