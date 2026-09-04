import type { RachelModule } from "@/core/contracts";
import { memoryContextProvider } from "./context";
import { memoriesIndexer } from "./indexer";
import { extractJob } from "./jobs";
import { indexJob, indexOnEvent } from "./search";
import { memoryTools } from "./tools";

export const memoryModule: RachelModule = {
  manifest: {
    id: "memory",
    name: "기억",
    icon: "brain",
    nav: { href: "/memory", order: 40, mobileTab: false },
    schemaVersion: 5,
  },
  tools: memoryTools,
  contextProviders: [memoryContextProvider],
  jobs: { extract: extractJob, index: indexJob },
  indexers: [memoriesIndexer],
  commands: [
    {
      id: "memory.open",
      label: "기억 보기",
      keywords: ["memory"],
      href: "/memory",
    },
  ],
  eventHandlers: [
    indexOnEvent,
    {
      on: "chat.turn_completed",
      handle: async (e, ctx) => {
        await ctx.enqueue({
          type: "memory.extract",
          payload: { threadId: e.entity.id },
          dedupeKey: `memory.extract:${e.entity.id}`,
          runAt: new Date(ctx.now.getTime() + 10 * 60_000),
        });
      },
    },
    {
      on: "meeting.summarized",
      handle: async (e, ctx) => {
        // meetings 모듈을 import 하지 않는다 — 요약 텍스트는 이벤트 페이로드로 받는다
        const text = (e.payload as { summaryText?: string }).summaryText;
        if (!text) return;
        await ctx.enqueue({
          type: "memory.extract",
          payload: { meetingId: e.entity.id, text },
          dedupeKey: `memory.extract:meeting:${e.entity.id}`,
        });
      },
    },
  ],
};
