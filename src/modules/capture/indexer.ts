import type { Indexer } from "@/core/contracts";
import { CAPTURE_EVENTS } from "./schema";
import { captureService } from "./service";

export const captureIndexer: Indexer = {
  sourceType: "capture",
  on: Object.values(CAPTURE_EVENTS),
  chunks: async (id, ctx) => {
    const row = await captureService(ctx).get(id);
    if (!row || row.status === "dismissed") return [];
    return [
      {
        index: 0,
        content: row.raw_text,
        metadata: {
          title: row.raw_text.slice(0, 80),
          href: `/capture/${id}`,
          status: row.status,
          sourceVersion: row.updated_at,
        },
      },
    ];
  },
};
