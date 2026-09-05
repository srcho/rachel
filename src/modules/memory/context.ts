import type { ContextProvider } from "@/core/contracts";
import { KIND_LABEL, type MemoryKind } from "./constants";
import { memoryService } from "./service";

/** 컨텍스트에 제공한 후보이며 실제 답변에서 인용했다는 의미는 아니다. */
export const memoryContextProvider: ContextProvider = {
  id: "memory.recall",
  budgetTokens: 1200,
  build: async (ctx, userQuery) => {
    const svc = memoryService(ctx);
    const [pinnedResult, recallResult] = await Promise.allSettled([
      svc.pinned(),
      svc.recallWithStatus(userQuery, 8),
    ]);
    const pinned =
      pinnedResult.status === "fulfilled" ? pinnedResult.value : [];
    const related =
      recallResult.status === "fulfilled" ? recallResult.value.memories : [];
    const notice =
      recallResult.status === "fulfilled"
        ? recallResult.value.notice
        : "기억 검색을 사용할 수 없어요. 고정 기억만 제공되며 관련 사실을 모두 확인했다고 말하지 마세요.";
    const seen = new Set<string>();
    const lines: string[] = [];
    for (const m of [
      ...pinned.map((p) => ({
        id: p.id,
        kind: p.kind,
        content: p.content,
        updatedAt: p.updated_at,
        confirmedAt: p.confirmed_at,
      })),
      ...related,
    ]) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      ctx.memoryReferences?.push({ id: m.id, title: m.content });
      lines.push(
        `- (${KIND_LABEL[m.kind as MemoryKind] ?? m.kind}${m.confirmedAt ? " · 직접 확인" : " · 확인되지 않음"}, ${m.updatedAt?.slice(0, 10) ?? "날짜 미정"}) ${m.content} [기억 확인·정정](/memory?id=${m.id}#memory-${m.id})`,
      );
    }
    if (notice) lines.unshift(`[검색 제한: ${notice}]`);
    if (pinnedResult.status === "rejected")
      lines.unshift(
        "[고정 기억 조회 실패: 저장된 선호를 모두 확인하지 못했어요.]",
      );
    if (lines.length === 0) return null;
    return `[기억: 오래된 사실은 현재 사실로 단정하지 말고 날짜를 함께 설명해요. 상충하면 확인해요.]\n${lines.join("\n")}`;
  },
};
