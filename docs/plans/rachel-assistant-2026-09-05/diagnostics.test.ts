import { writeFileSync } from "node:fs";
import { Chat } from "@ai-sdk/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { agentRepository } from "@/modules/agent/repository";
import { calendarTools } from "@/modules/calendar/tools";
import { captureService } from "@/modules/capture/service";
import { captureTools } from "@/modules/capture/tools";
import { insightsTools } from "@/modules/insights/tools";
import { meetingContextProvider } from "@/modules/meetings/context";
import {
  createMeetingNote,
  editMeetingSummary,
} from "@/modules/meetings/editing";
import { meetingsTools } from "@/modules/meetings/tools";
import { memoryTools } from "@/modules/memory/tools";
import { tasksTools } from "@/modules/tasks/tools";
import { localSupabaseAvailable, testUser } from "@/test/supabase";

// Do not load .env.local or call a real LLM. Fail instead of skipping DB diagnostics.
// The helper discovers credentials from the local Supabase CLI only.
for (const key of Object.keys(process.env)) {
  if (key.startsWith("TEST_SUPABASE_")) {
    throw new Error(
      "Unset TEST_SUPABASE_* before running local-only diagnostics",
    );
  }
}

it("records 37 exposed tools and their declared risk (not coverage percentage)", () => {
  const groups = {
    tasks: tasksTools,
    calendar: calendarTools,
    meetings: meetingsTools,
    memory: memoryTools,
    capture: captureTools,
    insights: insightsTools,
  };
  const inventory = Object.entries(groups).flatMap(([module, tools]) =>
    Object.entries(tools).map(([name, tool]) => ({
      name: `${module}.${name}`,
      risk: tool.risk,
      description: tool.description,
    })),
  );
  expect(inventory).toHaveLength(37);
  writeFileSync(
    new URL("./tool-inventory.json", import.meta.url),
    `${JSON.stringify({ commit: "dd3782d2ab10dcc0b6911f2dfe625f98ebeffc3d", inventory }, null, 2)}\n`,
  );
});

it("approval response alone changes UI state but sends no continuation request", async () => {
  const sendMessages = vi.fn(
    async () =>
      new ReadableStream({
        start(c) {
          c.close();
        },
      }),
  );
  const chat = new Chat({
    id: "audit-thread",
    messages: [
      {
        id: "assistant",
        role: "assistant",
        parts: [
          {
            type: "tool-tasks_delete",
            toolCallId: "call",
            state: "approval-requested",
            input: { id: "example" },
            approval: { id: "approval" },
          },
        ],
      },
    ],
    transport: { sendMessages, reconnectToStream: async () => null },
  });
  await chat.addToolApprovalResponse({ id: "approval", approved: true });
  expect(chat.messages[0]?.parts[0]).toMatchObject({
    state: "approval-responded",
  });
  expect(sendMessages).not.toHaveBeenCalled();
});

describe("isolated local user: current broken behavior", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let ctx: ToolContext;
  beforeAll(async () => {
    expect(
      await localSupabaseAvailable(),
      "Local Supabase must be running",
    ).toBe(true);
    user = await testUser("capability-audit");
    ctx = {
      userId: user.id,
      db: user.db,
      actor: "agent",
      now: new Date(),
      timezone: "Asia/Seoul",
      registry: createRegistry(() => []),
      emit: async () => {},
      enqueue: async () => "",
    };
  });
  afterAll(async () => user?.cleanup());

  it("summarize overwrites a manual note's full body without invoking an LLM", async () => {
    const id = crypto.randomUUID();
    const text = `${"회의 원문. ".repeat(100)}보존해야 하는 마지막 결정`;
    const before = await createMeetingNote(ctx, {
      id,
      title: "원문 보존 진단",
      text,
    });
    expect(before.summary_md).toBe(text);
    await meetingsTools.summarize?.execute({ id }, ctx);
    const { data, error } = await user.db
      .from("meetings")
      .select("summary_md, summary")
      .eq("id", id)
      .single();
    expect(error).toBeNull();
    expect(data?.summary_md).toBe(
      "전사된 내용이 너무 짧아 요약을 만들지 않았어요.",
    );
    expect(JSON.stringify(data)).not.toContain("보존해야 하는 마지막 결정");
  });

  it("task plan/repeat fields are stored but omitted from AI get", async () => {
    const result = await tasksTools.create?.execute(
      {
        title: "왕복 진단",
        planDate: "2026-09-07",
        repeatRule: { kind: "weekly", interval: 1, weekday: 1 },
      },
      ctx,
    );
    const { data, error } = await user.db
      .from("cards")
      .select("plan_date, repeat_rule")
      .eq("id", result.id)
      .single();
    expect(error).toBeNull();
    expect(data?.plan_date).toBe("2026-09-07");
    expect(data?.repeat_rule).toMatchObject({ kind: "weekly" });
    const read = await tasksTools.get?.execute({ id: result.id }, ctx);
    expect(read).toBeDefined();
    expect(read).not.toHaveProperty("planDate");
    expect(read).not.toHaveProperty("repeatRule");
  });

  it("201-message thread reload returns oldest 200, excluding latest message", async () => {
    const repo = agentRepository(user.db, user.id);
    const thread = await repo.createThread({ title: "긴 대화 진단" });
    const rows = Array.from({ length: 201 }, (_, i) => ({
      id: crypto.randomUUID(),
      user_id: user.id,
      thread_id: thread.id,
      role: "user",
      parts: [{ type: "text", text: `message-${i}` }],
      created_at: new Date(Date.UTC(2026, 8, 1, 0, 0, i)).toISOString(),
    }));
    const { error } = await user.db.from("chat_messages").insert(rows);
    expect(error).toBeNull();
    const loaded = await repo.listMessages(thread.id);
    expect(loaded).toHaveLength(200);
    expect(loaded[0]?.id).toBe(rows[0]?.id);
    expect(loaded.map((m) => m.id)).not.toContain(rows[200]?.id);
  });

  it("corrected meeting summary and AI context disagree immediately", async () => {
    const id = crypto.randomUUID();
    await createMeetingNote(ctx, {
      id,
      title: "결정 정정 진단",
      text: "출시일은 월요일",
    });
    await editMeetingSummary(ctx, id, {
      tldr: "출시일은 금요일",
      decisions: ["금요일 출시"],
    });
    const read = await meetingsTools.get?.execute({ id }, ctx);
    expect(read.summary.tldr).toBe("출시일은 금요일");
    const context = await meetingContextProvider.build(
      {
        ...ctx,
        ui: { route: `/meetings/${id}`, entity: { type: "meeting", id } },
      },
      "출시일",
    );
    expect(context).toContain("출시일은 월요일");
    expect(context).not.toContain("금요일");
  });

  it("invalid capture date freezes resolution and blocks correction and dismissal", async () => {
    const registry = createRegistry(() => [
      {
        manifest: {
          id: "tasks",
          name: "Tasks",
          icon: "list",
          schemaVersion: 1,
        },
        tools: tasksTools,
      },
    ]);
    const svc = captureService({ ...ctx, registry });
    const capture = await svc.add({ text: "마감 입력 검증 진단" });
    await expect(
      svc.resolve(capture.id, {
        type: "task",
        reason: "진단",
        task: { title: "잘못된 날짜", priority: 2, due: "내일" },
      }),
    ).rejects.toThrow();
    expect((await svc.get(capture.id))?.status).toBe("resolving");
    await expect(
      svc.resolve(capture.id, {
        type: "task",
        task: {
          title: "교정된 날짜",
          priority: 2,
          due: "2026-09-06T09:00:00+09:00",
        },
      }),
    ).rejects.toThrow();
    await svc.dismiss(capture.id);
    expect((await svc.get(capture.id))?.status).toBe("resolving");
  });
});
