import type { ContextProvider } from "@/core/contracts";
import { memoryService } from "./service";

const KIND_LABEL: Record<string, string> = {
  fact: "사실",
  preference: "선호",
  person: "사람",
  decision: "결정",
  goal: "목표",
  routine: "루틴",
};

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
      ...pinned.map((p) => ({ id: p.id, kind: p.kind, content: p.content })),
      ...related,
    ]) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      lines.push(`- (${KIND_LABEL[m.kind] ?? m.kind}) ${m.content}`);
    }
    if (lines.length === 0) return null;
    void svc.touch([...seen]).catch(() => {});
    return `[기억]\n${lines.join("\n")}`;
  },
};
