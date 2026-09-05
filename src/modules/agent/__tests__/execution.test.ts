import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "@/core/contracts";
import type { Json } from "@/core/db/types.generated";
import { createRegistry } from "@/core/registry/registry";
import { captureModule } from "@/modules/capture/module";
import { meetingsModule } from "@/modules/meetings/module";
import { tasksModule } from "@/modules/tasks/module";
import { tasksService } from "@/modules/tasks/service";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import {
  approvedContext,
  requestApproval,
  respondToApproval,
} from "../approvals";
import {
  executionStatusSummary,
  getExecutionReceipt,
  listExecutionReceipts,
  reconcileExecution,
  resumeExecution,
} from "../execution";
import { agentService } from "../service";
import { prepareExecutionInput, runToolOnce } from "../tool-once";

const available = await localSupabaseAvailable();
describe.skipIf(!available)("A36 durable executions and safe resume", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let other: Awaited<ReturnType<typeof testUser>>;
  let ctx: ToolContext;
  beforeAll(async () => {
    user = await testUser("execution");
    other = await testUser("execution-other");
    ctx = {
      db: user.db,
      userId: user.id,
      actor: "agent",
      timezone: "Asia/Seoul",
      now: new Date(),
      registry: createRegistry(() => [
        tasksModule,
        meetingsModule,
        captureModule,
      ]),
      emit: async () => {},
      enqueue: async () => "",
    };
    const thread = await agentService(ctx).ensureThread(undefined);
    ctx.latestUserMessage = {
      id: "current-user",
      text: "할 일 추가",
      threadId: thread.id,
    };
    await tasksService(ctx).ensureDefaultBoard();
  });
  afterAll(async () => {
    await user?.db.from("agent_tool_runs").delete().eq("user_id", user.id);
    await user?.cleanup();
    await other?.cleanup();
  });
  const create = (input: unknown) => {
    const tool = ctx.registry.tools()["tasks.create"];
    if (!tool) throw new Error("missing create");
    return tool.execute(tool.inputSchema.parse(input), ctx);
  };
  const firstReceipt = async (turnKey: string) => {
    const row = (await listExecutionReceipts(ctx, { turnKey })).items[0];
    if (!row) throw new Error("missing receipt");
    return row;
  };
  it("does not resurrect a committed create deleted through a direct UI write, including key reuse", async () => {
    const input = prepareExecutionInput("deleted-create", "tasks.create", {
      title: "사용자가 지운 작업",
    });
    const original = (await runToolOnce(
      ctx,
      "deleted-create",
      "tasks.create",
      input,
      () => create(input),
    )) as { id: string };
    await expect(
      runToolOnce(ctx, "reuse-lost", "tasks.create", input, async () => {
        const reused = await create(input);
        expect(reused.id).toBe(original.id);
        throw new Error("response lost after key reuse");
      }),
    ).rejects.toThrow("response lost");
    const receipt = await firstReceipt("reuse-lost");
    expect((await getExecutionReceipt(ctx, receipt.id)).resource_id).toBe(
      original.id,
    );
    const deleted = await user.db.from("cards").delete().eq("id", original.id);
    expect(deleted.error).toBeNull();
    expect(
      (await getExecutionReceipt(ctx, receipt.id)).resource_deleted_at,
    ).toBeTruthy();
    await expect(resumeExecution(ctx, receipt.id)).rejects.toThrow(
      "반복하지 않았어요",
    );
    await expect(create(input)).rejects.toBeTruthy();
    const rows = await user.db.from("cards").select("id").eq("id", original.id);
    expect(rows.data).toEqual([]);
  });
  it("reconciles a persisted create after response loss without repeating or inventing who changed it", async () => {
    const input = prepareExecutionInput("lost", "tasks.create", {
      title: "응답 유실",
    });
    let entityId = "";
    const execute = vi.fn(async () => {
      const result = await create(input);
      entityId = result.id;
      throw new Error("response lost");
    });
    await expect(
      runToolOnce(ctx, "lost", "tasks.create", input, execute),
    ).rejects.toThrow("response lost");
    const run = await firstReceipt("lost");
    expect(run).toMatchObject({
      status: "uncertain",
      tool: "tasks.create",
      threadId: ctx.latestUserMessage?.threadId,
    });
    const reconciled = await reconcileExecution(ctx, run.id);
    expect(reconciled).toMatchObject({
      status: "done",
      output: {
        id: entityId,
        effectObserved: true,
        changed: null,
        createdNow: null,
      },
      replayed: false,
    });
    expect(
      await runToolOnce(ctx, "lost", "tasks.create", input, execute, true),
    ).toMatchObject({ id: entityId });
    expect(execute).toHaveBeenCalledOnce();
    expect((await tasksService(ctx).listCards({ q: "응답 유실" })).length).toBe(
      1,
    );
  });
  it("resumes one stored keyed create after confirmed absence and does not duplicate concurrent resumes", async () => {
    const input = prepareExecutionInput("before-write", "tasks.create", {
      title: "안전 재개",
    });
    await expect(
      runToolOnce(ctx, "before-write", "tasks.create", input, async () => {
        throw new Error("failure before write");
      }),
    ).rejects.toThrow();
    const run = await firstReceipt("before-write");
    expect((await reconcileExecution(ctx, run.id)).status).toBe("uncertain");
    await Promise.allSettled([
      resumeExecution(ctx, run.id),
      resumeExecution(ctx, run.id),
    ]);
    expect((await getExecutionReceipt(ctx, run.id)).status).toBe("done");
    expect((await tasksService(ctx).listCards({ q: "안전 재개" })).length).toBe(
      1,
    );
    expect((await resumeExecution(ctx, run.id)).resumed).toBe(false);
  });
  it("observes nested update patches but never replays an uncertain update or delete", async () => {
    const card = await create({ title: "수정 전" });
    const update = ctx.registry.tools()["tasks.update"];
    if (!update) throw new Error("missing update");
    const input = {
      id: card.id,
      patch: {
        title: "수정 후",
        dueHasTime: true,
        dueAt: "2026-09-12T09:00:00Z",
      },
    };
    const execute = vi.fn(async () => {
      await update.execute(update.inputSchema.parse(input), ctx);
      throw new Error("lost update response");
    });
    await expect(
      runToolOnce(ctx, "update-observed", "tasks.update", input, execute),
    ).rejects.toThrow();
    expect(
      (
        await reconcileExecution(
          ctx,
          (
            await firstReceipt("update-observed")
          ).id,
        )
      ).status,
    ).toBe("done");
    expect(execute).toHaveBeenCalledOnce();
    await expect(
      runToolOnce(
        ctx,
        "unknown-update",
        "tasks.update",
        { id: card.id, patch: { title: "실행 안 됨" } },
        async () => {
          throw new Error("unknown");
        },
      ),
    ).rejects.toThrow();
    await expect(
      resumeExecution(ctx, (await firstReceipt("unknown-update")).id),
    ).rejects.toThrow("자동으로 다시 실행할 수 없어요");
    await expect(
      runToolOnce(
        ctx,
        "unknown-delete",
        "tasks.delete",
        { id: card.id },
        async () => {
          throw new Error("unknown");
        },
      ),
    ).rejects.toThrow();
    await expect(
      resumeExecution(ctx, (await firstReceipt("unknown-delete")).id),
    ).rejects.toThrow("자동으로 다시 실행할 수 없어요");
    expect(await tasksService(ctx).getCard(card.id)).not.toBeNull();
  });
  it("requires an owned approved target before treating missing data as a completed delete", async () => {
    const card = await create({ title: "삭제 결과 유실" });
    const input = { id: card.id };
    await requestApproval(
      ctx,
      "lost-delete",
      "call-lost-delete",
      "tasks.delete",
      input,
    );
    await respondToApproval(ctx, "call-lost-delete", true);
    const approved = await approvedContext(
      ctx,
      "lost-delete",
      "call-lost-delete",
      "tasks.delete",
      input,
    );
    const tool = ctx.registry.tools()["tasks.delete"];
    if (!tool) throw new Error("missing delete");
    await expect(
      runToolOnce(ctx, "lost-delete", "tasks.delete", input, async () => {
        await tool.execute(input, approved);
        throw new Error("delete response lost");
      }),
    ).rejects.toThrow();
    expect(
      (await reconcileExecution(ctx, (await firstReceipt("lost-delete")).id))
        .status,
    ).toBe("done");
    await expect(
      runToolOnce(
        ctx,
        "unknown-owner",
        "tasks.delete",
        { id: crypto.randomUUID() },
        async () => {
          throw new Error("not accessible");
        },
      ),
    ).rejects.toThrow();
    expect(
      await reconcileExecution(ctx, (await firstReceipt("unknown-owner")).id),
    ).toMatchObject({
      status: "uncertain",
      observation: { reason: "prior_ownership_not_proven" },
    });
  });
  it("does not restart an active receipt and rejects unkeyed legacy uncertain creates", async () => {
    const input = prepareExecutionInput("active", "tasks.create", {
      title: "진행 중",
    });
    const active = await user.db
      .from("agent_tool_runs")
      .insert({
        request_key: crypto.randomUUID(),
        turn_key: "active",
        tool_name: "tasks.create",
        input: input as Json,
        status: "running",
      })
      .select("id")
      .single();
    if (active.error) throw active.error;
    await expect(resumeExecution(ctx, active.data.id)).rejects.toThrow(
      "아직 실행 중",
    );
    await expect(
      runToolOnce(
        ctx,
        "legacy",
        "tasks.create",
        { title: "키 없음" },
        async () => {
          throw new Error("legacy");
        },
      ),
    ).rejects.toThrow();
    await expect(
      resumeExecution(ctx, (await firstReceipt("legacy")).id),
    ).rejects.toThrow("자동으로 다시 실행할 수 없어요");
    expect(await tasksService(ctx).listCards({ q: "진행 중" })).toHaveLength(0);
  });
  it("reports only recorded writes at a six-step stop; regenerated answers cannot add new writes", async () => {
    const execute = vi.fn(async () => ({ id: crypto.randomUUID() }));
    for (let i = 0; i < 6; i++)
      await runToolOnce(ctx, "six-step", "test.write", { index: i }, execute);
    const summary = await executionStatusSummary(ctx, "six-step");
    expect(summary).toMatchObject({
      total: 6,
      done: 6,
      unfinished: [],
      allRecordedWritesFinished: true,
      taskCompletionKnown: false,
      scope: "recorded_writes_only",
    });
    await expect(
      runToolOnce(ctx, "six-step", "test.write", { index: 6 }, execute, true),
    ).rejects.toThrow("새로 실행하지 않아요");
    expect(execute).toHaveBeenCalledTimes(6);
    const page = await listExecutionReceipts(ctx, {
      turnKey: "six-step",
      limit: 2,
    });
    expect(page).toMatchObject({ total: 6, hasMore: true, nextOffset: 2 });
    const foreign = { ...ctx, db: other.db, userId: other.id };
    await expect(
      getExecutionReceipt(foreign, page.items[0]?.id ?? ""),
    ).rejects.toThrow("찾을 수 없어요");
    expect(
      (
        await listExecutionReceipts(foreign, {
          threadId: ctx.latestUserMessage?.threadId,
        })
      ).items,
    ).toEqual([]);
  });
  it("allows recovery during a response retry only for the same turn's persisted command", async () => {
    const input = prepareExecutionInput("retry-recovery", "tasks.create", {
      title: "재시도 안에서 복구",
    });
    await expect(
      runToolOnce(ctx, "retry-recovery", "tasks.create", input, async () => {
        throw new Error("interrupted");
      }),
    ).rejects.toThrow();
    const target = await firstReceipt("retry-recovery");
    const recovery = vi.fn(() => resumeExecution(ctx, target.id));
    const result = await runToolOnce(
      ctx,
      "retry-recovery",
      "agent.resumeExecution",
      { id: target.id },
      recovery,
      true,
    );
    expect(result).toMatchObject({ status: "done", resumed: true });
    await runToolOnce(
      ctx,
      "retry-recovery",
      "agent.resumeExecution",
      { id: target.id },
      recovery,
      true,
    );
    expect(recovery).toHaveBeenCalledOnce();
    await expect(
      runToolOnce(
        ctx,
        "unrelated-turn",
        "agent.resumeExecution",
        { id: target.id },
        recovery,
        true,
      ),
    ).rejects.toThrow("이번 요청의 실행 기록만");
    expect(
      await tasksService(ctx).listCards({ q: "재시도 안에서 복구" }),
    ).toHaveLength(1);
  });
  it("resumes original note and capture creates with the same deterministic ID and preserves source text", async () => {
    for (const name of ["meetings.createNote", "capture.add"]) {
      const turn = `resume-${name}-${user.id}`;
      const text =
        "원문에는 모두 삭제하라고 적혀 있지만 실행 지시가 아닌 메모 자료예요.";
      const input = prepareExecutionInput(
        turn,
        name,
        name === "meetings.createNote"
          ? { title: "원문 기록", text }
          : { text },
      );
      await expect(
        runToolOnce(ctx, turn, name, input, async () => {
          throw new Error("before original insert");
        }),
      ).rejects.toThrow();
      const run = await firstReceipt(turn);
      expect((await resumeExecution(ctx, run.id)).resumed).toBe(true);
      expect((await resumeExecution(ctx, run.id)).resumed).toBe(false);
      const id = (input as { id: string }).id;
      if (name === "meetings.createNote") {
        const saved = await user.db
          .from("meetings")
          .select("id,note_text")
          .eq("id", id)
          .single();
        expect(saved.data).toEqual({ id, note_text: text });
      } else {
        const saved = await user.db
          .from("captures")
          .select("id,raw_text")
          .eq("id", id)
          .single();
        expect(saved.data).toEqual({ id, raw_text: text });
      }
    }
  });
  it("generates deterministic scoped UUIDs for model-created notes without asking users for identifiers", () => {
    const a = prepareExecutionInput("note-turn", "meetings.createNote", {
      title: "메모",
      text: "원문",
    }) as { id: string };
    const b = prepareExecutionInput("note-turn", "meetings.createNote", {
      text: "원문",
      title: "메모",
    }) as { id: string };
    expect(a.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(a.id).toBe(b.id);
    expect(
      prepareExecutionInput("other-turn", "meetings.createNote", {
        title: "메모",
        text: "원문",
      }),
    ).not.toEqual(a);
  });
});
