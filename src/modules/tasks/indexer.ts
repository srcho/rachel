import type { Indexer } from "@/core/contracts";
import { tasksRepository } from "./repository";

/** 카드 1장 = 청크 1개(제목·라벨·설명). 아카이브·삭제되면 청크 0개 → 인덱스에서 제거 */
export const cardsIndexer: Indexer = {
  sourceType: "card",
  on: ["task.created", "task.updated", "task.archived", "task.deleted"],
  chunks: async (id, ctx) => {
    const card = await tasksRepository(ctx.db, ctx.userId).getCard(id);
    if (!card || card.archived_at) return [];
    const text = [
      card.title,
      card.labels.length ? `라벨: ${card.labels.join(", ")}` : "",
      card.description_md,
    ]
      .filter(Boolean)
      .join("\n");
    return [
      {
        index: 0,
        content: text.slice(0, 2000),
        metadata: {
          title: card.title,
          href: `/tasks/${card.board_id}`,
          completed: card.completed_at !== null,
          dueAt: card.due_at,
        },
      },
    ];
  },
};
