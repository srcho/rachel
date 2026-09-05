import type { ContextProvider } from "@/core/contracts";
import { KIND_LABEL, type MemoryKind } from "./constants";
import { memoryService } from "./service";

/** 질의와 관련된 기억 top-8 + 고정 기억. 사용된 기억은 use_count 를 올린다. */
export const memoryContextProvider: ContextProvider = {
  id: "memory.recall",
  budgetTokens: 1200,
  build: async (ctx, userQuery) => {
    const svc = memoryService(ctx);
    const [pinned, related] = await Promise.all([
      svc.pinned(),
      userQuery.trim() ? svc.recall(userQuery, 8) : Promise.resolve([]),
    ]);
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
        `- (${KIND_LABEL[m.kind as MemoryKind] ?? m.kind}${m.confirmedAt ? " · 직접 확인" : " · 확인되지 않음"}, ${m.updatedAt?.slice(0, 10) ?? "날짜 미정"}) ${m.content} [기억 확인·정정](/memory#memory-${m.id})`,
      );
    }
    if (lines.length === 0) return null;
    void svc.touch([...seen]).catch(() => {});
    return `[기억: 오래된 사실은 현재 사실로 단정하지 말고 날짜를 함께 설명해요. 상충하면 확인해요.]\n${lines.join("\n")}`;
  },
};
