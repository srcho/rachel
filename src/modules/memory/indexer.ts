import type { Indexer } from "@/core/contracts";
import { memoryRepository } from "./repository";

export const memoriesIndexer: Indexer = {
  sourceType: "memory",
  on: ["memory.created", "memory.updated", "memory.forgotten"],
  chunks: async (id, ctx) => {
    const m = await memoryRepository(ctx.db, ctx.userId).get(id);
    if (!m || m.status !== "active" || m.review_against || m.invalidated_at)
      return [];
    return [
      {
        index: 0,
        content: m.content,
        metadata: {
          title: m.content.slice(0, 60),
          href: `/memory?id=${m.id}#memory-${m.id}`,
          confirmedAt: m.confirmed_at,
          source: m.source,
          kind: m.kind,
        },
      },
    ];
  },
};
