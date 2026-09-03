import type { RachelModule } from "@/core/contracts";
import { memoryContextProvider } from "./context";
import { extractJob } from "./jobs";
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
  jobs: { extract: extractJob },
  commands: [
    {
      id: "memory.open",
      label: "기억 보기",
      keywords: ["memory"],
      href: "/memory",
    },
  ],
  eventHandlers: [
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
        await ctx.enqueue({
          type: "memory.extract",
          payload: { meetingId: e.entity.id },
          dedupeKey: `memory.extract:meeting:${e.entity.id}`,
        });
      },
    },
  ],
};
