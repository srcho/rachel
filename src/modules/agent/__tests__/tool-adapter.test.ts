import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { AnyAgentTool, ToolContext } from "@/core/contracts";
import { adaptTools, toAiToolName } from "../tool-adapter";

describe("adaptTools", () => {
  it("renames dotted tool names and requires approval for destructive tools", () => {
    const defs: Record<string, AnyAgentTool> = {
      "tasks.list": {
        description: "l",
        inputSchema: z.object({}),
        risk: "read",
        execute: async () => [],
      },
      "tasks.delete": {
        description: "d",
        inputSchema: z.object({ id: z.string() }),
        risk: "destructive",
        execute: async () => ({}),
      },
    };
    const { tools, toolApproval } = adaptTools(defs, {} as ToolContext);
    expect(Object.keys(tools)).toEqual(["tasks_list", "tasks_delete"]);
    expect(toolApproval).toEqual({ tasks_delete: "user-approval" });
    expect(toAiToolName("meetings.createTasksFromActionItems")).toMatch(
      /^[a-zA-Z0-9_-]+$/,
    );
  });
});
