import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { RachelModule } from "@/core/contracts";
import { createRegistry, matchesEventPattern } from "../registry";

const tasks: RachelModule = {
  manifest: {
    id: "tasks",
    name: "할 일",
    icon: "kanban",
    nav: { href: "/tasks", order: 2, mobileTab: true },
    schemaVersion: 1,
  },
  tools: {
    create: {
      description: "카드 생성",
      inputSchema: z.object({ title: z.string() }),
      risk: "write",
      execute: async () => ({ id: "c1" }),
    },
  },
  widgets: [
    {
      id: "due",
      title: "마감",
      surface: "today",
      size: "md",
      order: 20,
      load: async () => null,
      Component: () => null,
    },
    {
      id: "throughput",
      title: "처리량",
      surface: "both",
      size: "lg",
      order: 10,
      load: async () => null,
      Component: () => null,
    },
  ],
  eventHandlers: [{ on: "task.*", handle: async () => {} }],
  jobs: { reindex: { schema: z.object({}), run: async () => {} } },
};

const memory: RachelModule = {
  manifest: {
    id: "memory",
    name: "기억",
    icon: "brain",
    nav: { href: "/memory", order: 1 },
    schemaVersion: 1,
  },
  eventHandlers: [{ on: ["*"], handle: async () => {} }],
  indexers: [
    {
      sourceType: "card",
      on: ["task.created", "task.updated"],
      chunks: async () => [],
    },
  ],
};

describe("Registry", () => {
  const reg = createRegistry(() => [tasks, memory]);

  it("prefixes tools and jobs with module id", () => {
    expect(Object.keys(reg.tools())).toEqual(["tasks.create"]);
    expect(Object.keys(reg.jobHandlers())).toEqual(["tasks.reindex"]);
  });

  it("matches event handlers by glob", () => {
    expect(reg.eventHandlers("task.created")).toHaveLength(2);
    expect(reg.eventHandlers("meeting.summarized")).toHaveLength(1);
  });

  it("sorts widgets per surface", () => {
    expect(reg.widgets("today").map((w) => w.id)).toEqual([
      "throughput",
      "due",
    ]);
    expect(reg.widgets("insights").map((w) => w.id)).toEqual(["throughput"]);
  });

  it("orders nav and marks mobile tabs", () => {
    expect(reg.nav().map((n) => [n.id, n.mobileTab])).toEqual([
      ["memory", false],
      ["tasks", true],
    ]);
  });

  it("filters indexers by trigger event", () => {
    expect(reg.indexers("task.updated")).toHaveLength(1);
    expect(reg.indexers("task.moved")).toHaveLength(0);
  });

  it("rejects duplicate module ids", () => {
    expect(() => createRegistry(() => [tasks, tasks]).modules()).toThrow(
      /중복/,
    );
  });
});

describe("matchesEventPattern", () => {
  it("handles exact, wildcard and prefix patterns", () => {
    expect(matchesEventPattern("a.b", "a.b")).toBe(true);
    expect(matchesEventPattern("a.*", "a.b")).toBe(true);
    expect(matchesEventPattern("a.*", "ab.c")).toBe(false);
    expect(matchesEventPattern("*", "x.y")).toBe(true);
  });
});
