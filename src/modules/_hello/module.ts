import { z } from "zod";
import type { RachelModule } from "@/core/contracts";
import { HelloWidget } from "./widget";

/** P0 검증용 더미 모듈. P1에서 tasks 모듈이 들어오면 삭제한다. */
export const helloModule: RachelModule = {
  manifest: {
    id: "hello",
    name: "Today",
    icon: "sun",
    nav: { href: "/today", order: 10, mobileTab: true },
    schemaVersion: 0,
  },
  tools: {
    ping: {
      description: "연결 확인. 입력한 메시지를 그대로 돌려준다.",
      inputSchema: z.object({ message: z.string().default("pong") }),
      risk: "read",
      execute: async ({ message }, ctx) => ({
        message,
        at: ctx.now.toISOString(),
      }),
    },
  },
  widgets: [
    {
      id: "hello",
      title: "레지스트리 확인",
      surface: "today",
      size: "sm",
      order: 999,
      load: async (ctx) => ({ userId: ctx.userId, at: ctx.now.toISOString() }),
      Component: HelloWidget,
    },
  ],
  jobs: {
    echo: {
      schema: z.object({ text: z.string() }),
      run: async ({ text }, ctx) => {
        await ctx.emit({
          type: "hello.echoed",
          entity: { type: "hello", id: "0" },
          payload: { text },
        });
      },
    },
  },
  eventHandlers: [
    {
      on: "hello.*",
      handle: async (e) => console.info("[hello] event", e.type, e.payload),
    },
  ],
};
