import { z } from "zod";
import { defineTool } from "@/core/contracts";
import { listBackups, runBackup } from "./backup";

export const systemTools = {
  listBackups: defineTool({
    description:
      "내 최근 백업의 생성 시각과 크기를 조회한다. 백업에는 오디오가 포함되지 않는다.",
    inputSchema: z.object({}),
    risk: "read",
    execute: async (_input, ctx) => ({
      items: await listBackups(ctx),
      href: "/settings",
    }),
  }),
  backup: defineTool({
    description:
      "사용자가 요청한 개인 데이터 백업을 생성한다. 저장 성공 뒤에만 완료를 알린다. 오디오 제외, 최근 8개 보관.",
    inputSchema: z.object({}),
    risk: "write",
    execute: async (_input, ctx) => ({
      ...(await runBackup(ctx)),
      href: "/settings",
    }),
  }),
  export: defineTool({
    description:
      "인증된 내 데이터 전체 JSON 다운로드 링크를 제공한다. 실제 다운로드가 완료됐다고 말하지 않는다.",
    inputSchema: z.object({}),
    risk: "read",
    execute: async () => ({
      href: "/api/export",
      title: "내 데이터 내려받기",
      status: "download_available",
      excludes: ["오디오", "임베딩 벡터"],
    }),
  }),
};
