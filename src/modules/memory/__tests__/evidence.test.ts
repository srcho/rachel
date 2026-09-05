import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { ToolContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { localSupabaseAvailable, testUser } from "@/test/supabase";

const state = vi.hoisted(() => ({
  failEmbed: false,
  prompt: "",
  messages: [] as Array<{
    role: string;
    parts: Array<{ type: string; text: string }>;
  }>,
  memories: [] as Array<{
    kind: string;
    content: string;
    importance: number;
    evidence: string;
  }>,
}));
vi.mock("@/core/llm/client", () => ({
  llmEmbed: async ({ value }: { value: string }) => {
    if (state.failEmbed) throw new Error("embedding offline");
    const embedding = new Array(1536).fill(0);
    for (let i = 0; i < value.length; i++)
      embedding[(value.charCodeAt(i) * 31 + i) % 1536] += 1;
    const norm = Math.hypot(...embedding) || 1;
    return { embedding: embedding.map((v) => v / norm) };
  },
  llmGenerate: async ({ prompt }: { prompt: string }) => {
    state.prompt = prompt;
    return { output: { memories: state.memories } };
  },
}));
vi.mock("@/modules/agent/service", () => ({
  agentService: () => ({ loadMessages: async () => state.messages }),
}));

import { memoryContextProvider } from "../context";
import { extractJob } from "../jobs";
import { memoryModule } from "../module";
import { reindexSource, searchAllWithStatus } from "../search";
import { memoryService } from "../service";
import { memoryTools } from "../tools";

const rememberTool = memoryTools.remember;
if (!rememberTool) throw new Error("memory.remember is missing");
const available = await localSupabaseAvailable();
describe.skipIf(!available)("memory evidence A25-A28", () => {
  let user: Awaited<ReturnType<typeof testUser>>;
  let ctx: ToolContext;
  beforeAll(async () => {
    user = await testUser("memory-evidence");
    ctx = {
      userId: user.id,
      db: user.db,
      actor: "agent",
      now: new Date(),
      timezone: "Asia/Seoul",
      registry: createRegistry(() => [memoryModule]),
      emit: async () => {},
      enqueue: async () => "job",
      memoryReferences: [],
    };
  });
  beforeEach(() => {
    state.failEmbed = false;
    state.memories = [];
    ctx.memoryReferences = [];
  });
  afterAll(async () => user?.cleanup());

  it("extracts a short, explicit preference instead of discarding it by length", async () => {
    const text = "고수는 안 먹어요";
    state.memories = [
      {
        kind: "preference",
        content: "사용자는 고수를 먹지 않는다",
        importance: 3,
        evidence: text,
      },
    ];
    const result = await memoryService(ctx).extractFrom(text, {
      type: "inference",
    });
    expect(result.created).toBe(1);
    expect(state.prompt).toBe(text);
    const stored = await memoryService(ctx).listPage({ q: "고수를 먹지" });
    expect(stored.items[0]?.confirmed_at).toBeNull();
  });

  it("A25 verifies user evidence and does not confirm a model inference or paraphrase", async () => {
    const input = {
      kind: "preference",
      content: "오전 회의를 피해주세요",
      importance: 3,
    };
    const inferred = await rememberTool.execute(input, ctx);
    expect(inferred).toMatchObject({
      operationalSettingsChanged: false,
      nextTool: "agent.updatePreferences",
    });
    expect(inferred.source.evidence).toBe("model_inference");
    expect(inferred.confirmedAt).toBeNull();
    expect(inferred.source.type).toBe("inference");
    await expect(
      rememberTool.execute({ ...input, userQuote: "그런 말을 안 했어요" }, ctx),
    ).rejects.toThrow("근거");
    const explicit = await rememberTool.execute(
      {
        ...input,
        content: "금요일은 재택근무입니다",
        userQuote: "금요일은 재택근무입니다",
      },
      {
        ...ctx,
        latestUserMessage: {
          id: crypto.randomUUID(),
          threadId: crypto.randomUUID(),
          text: "금요일은 재택근무입니다. 기억해줘",
        },
      },
    );
    expect(explicit.source.evidence).toBe("explicit_user");
    expect(explicit.confirmedAt).not.toBeNull();
    const paraphrase = await rememberTool.execute(
      {
        ...input,
        content: "사용자는 모든 재택근무를 선호한다",
        userQuote: "금요일은 재택근무입니다",
      },
      {
        ...ctx,
        latestUserMessage: {
          id: crypto.randomUUID(),
          text: "금요일은 재택근무입니다",
        },
      },
    );
    expect(paraphrase.confirmedAt).toBeNull();
  });

  it("A25 excludes assistant proposals from extraction and requires a verbatim evidence span", async () => {
    state.messages = [
      {
        role: "user",
        parts: [
          {
            type: "text",
            text: "이번 주 일정을 확인해 주고 다음 주 계획도 같이 검토해주세요",
          },
        ],
      },
      {
        role: "assistant",
        parts: [{ type: "text", text: "매일 새벽 운동을 좋아하시는군요" }],
      },
    ];
    state.memories = [
      {
        kind: "routine",
        content: "사용자는 매일 새벽 운동을 좋아한다",
        importance: 3,
        evidence: "매일 새벽 운동을 좋아하시는군요",
      },
    ];
    await extractJob.run({ threadId: crypto.randomUUID() }, ctx);
    expect(state.prompt).toContain("이번 주 일정을");
    expect(state.prompt).not.toContain("새벽 운동");
    expect(await memoryService(ctx).list({ q: "새벽 운동" })).toHaveLength(0);
  });

  it("A26 resolves a collision through the common service and excludes the superseded memory immediately", async () => {
    const vector = new Array(1536).fill(0);
    vector[1000] = 1;
    const svc = memoryService(
      { ...ctx, actor: "user" },
      { embed: async () => vector },
    );
    const old = await svc.remember({
      kind: "decision",
      content: "계약 검토는 월요일",
      source: { type: "manual" },
    });
    await reindexSource(ctx, "memory", old.memory.id);
    // Reindex uses another vector; force a collision deterministically.
    await user.db
      .from("memories")
      .update({ embedding: JSON.stringify(vector) })
      .eq("id", old.memory.id);
    const next = await svc.remember({
      kind: "decision",
      content: "계약 검토는 화요일",
      source: { type: "manual" },
    });
    expect((await svc.reviewList()).some((m) => m.id === next.memory.id)).toBe(
      true,
    );
    expect(next.memory.confirmed_at).toBeNull();
    const result = await svc.resolveReview(next.memory.id, "replace");
    expect(result.original?.status).toBe("archived");
    expect(result.original?.valid_until).not.toBeNull();
    expect(result.memory?.confirmed_at).not.toBeNull();
    expect((await svc.recall("검토")).map((m) => m.id)).not.toContain(
      old.memory.id,
    );
    const stale = await user.db
      .from("search_chunks")
      .select("id")
      .eq("source_id", old.memory.id);
    expect(stale.data).toHaveLength(0);
    await svc.update(next.memory.id, { status: "archived" });
    expect((await svc.update(next.memory.id, { status: "active" })).id).toBe(
      next.memory.id,
    );
  });

  it("A27 invalidates derived memories on source correction and deletion, rejecting stale extraction and restore", async () => {
    const created = await user.db
      .from("meetings")
      .insert({ user_id: user.id, title: "이전 결정" })
      .select("*")
      .single();
    if (created.error) throw created.error;
    const meeting = created.data;
    const svc = memoryService(ctx);
    const input = {
      kind: "decision" as const,
      content: "프로젝트 이전 결정을 기억합니다",
      source: {
        type: "meeting" as const,
        id: meeting.id,
        version: meeting.content_version,
      },
    };
    const old = await svc.remember(input);
    await svc.update(old.memory.id, { pinned: true });
    await reindexSource(ctx, "memory", old.memory.id);
    const corrected = await user.db
      .from("meetings")
      .update({ title: "변경된 결정" })
      .eq("id", meeting.id)
      .select("*")
      .single();
    if (corrected.error) throw corrected.error;
    const invalid = await svc.get(old.memory.id);
    expect(invalid?.status).toBe("archived");
    expect(invalid?.invalidated_at).not.toBeNull();
    expect((await svc.pinned()).map((m) => m.id)).not.toContain(old.memory.id);
    await expect(
      svc.update(old.memory.id, { status: "active" }),
    ).rejects.toThrow("원본");
    await expect(
      svc.remember({ ...input, content: "늦게 도착한 옛 결정" }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("version conflict"),
    });
    const current = await svc.remember({
      ...input,
      content: "변경된 프로젝트 결정입니다",
      source: { ...input.source, version: corrected.data.content_version },
    });
    const deleted = await user.db
      .from("meetings")
      .delete()
      .eq("id", meeting.id);
    if (deleted.error) throw deleted.error;
    expect((await svc.get(current.memory.id))?.invalidated_at).not.toBeNull();
    expect(
      (await searchAllWithStatus(ctx, "프로젝트")).hits.some(
        (h) => h.sourceId === old.memory.id,
      ),
    ).toBe(false);
  });

  it("A27 rejects late stale indexing and invalidates capture evidence only when content changes", async () => {
    const svc = memoryService(ctx);
    const capture = await user.db
      .from("captures")
      .insert({ user_id: user.id, raw_text: "원본 캡처 근거" })
      .select("*")
      .single();
    if (capture.error) throw capture.error;
    const memory = await svc.remember({
      kind: "fact",
      content: "원본 캡처를 바탕으로 만든 기억",
      source: {
        type: "capture",
        id: capture.data.id,
        evidence: "explicit_user",
      },
    });
    await user.db
      .from("captures")
      .update({ status: "resolved" })
      .eq("id", capture.data.id);
    expect((await svc.get(memory.memory.id))?.invalidated_at).toBeNull();
    await user.db
      .from("captures")
      .update({ raw_text: "교정한 캡처 근거" })
      .eq("id", capture.data.id);
    expect((await svc.get(memory.memory.id))?.invalidated_at).not.toBeNull();
    const late = await user.db.from("search_chunks").insert({
      user_id: user.id,
      source_type: "memory",
      source_id: memory.memory.id,
      chunk_index: 0,
      content: memory.memory.content,
    });
    expect(late.error?.message).toContain("version conflict");
    const second = await svc.remember({
      kind: "fact",
      content: "삭제할 캡처의 다른 근거",
      source: { type: "capture", id: capture.data.id },
    });
    const deleted = await user.db
      .from("captures")
      .delete()
      .eq("id", capture.data.id);
    if (deleted.error) throw deleted.error;
    expect((await svc.get(second.memory.id))?.invalidated_at).not.toBeNull();
  });

  it("A28 saves and updates during embedding failure, preserves pinned context, and exposes keyword-only retrieval", async () => {
    state.failEmbed = true;
    const svc = memoryService({ ...ctx, actor: "user" });
    const created = await svc.remember({
      kind: "preference",
      content: "고정 운영 선호는 언제나 보존",
      source: { type: "manual" },
    });
    expect(created.memory.index_status).toBe("pending");
    await svc.update(created.memory.id, {
      pinned: true,
      content: "고정 운영 선호를 교정해 보존",
    });
    const recalled = await svc.recallWithStatus("고정 운영");
    expect(recalled.status).toBe("keyword_only");
    expect(recalled.memories.map((m) => m.id)).toContain(created.memory.id);
    const context = await memoryContextProvider.build(ctx, "다른 검색어");
    expect(context).toContain("고정 운영 선호를 교정해 보존");
    expect(context).toContain("검색 제한");
    expect((await svc.get(created.memory.id))?.use_count).toBe(0);
    await expect(
      reindexSource(ctx, "memory", created.memory.id),
    ).rejects.toThrow("embedding offline");
    const found = await searchAllWithStatus(ctx, "고정 운영");
    expect(found.status).toBe("keyword_only");
    expect(found.notice).toBeTruthy();
    expect(found.hits.some((h) => h.sourceId === created.memory.id)).toBe(true);
    state.failEmbed = false;
    await reindexSource(ctx, "memory", created.memory.id);
    expect((await svc.get(created.memory.id))?.index_status).toBe("ready");
  });
  it("Undo skips reused creation keys and protects newly created memory versions", async () => {
    const input = {
      creationKey: crypto.randomUUID(),
      kind: "fact",
      content: "기억 재시도 고유 확인",
      importance: 3,
    };
    const first = await rememberTool.execute(input, ctx);
    const reused = await rememberTool.execute(input, ctx);
    expect(first.createdNow).toBe(true);
    expect(reused.createdNow).toBe(false);
    await rememberTool.undo?.(reused, ctx);
    expect(await memoryService(ctx).get(first.id)).not.toBeNull();
    await memoryService({ ...ctx, actor: "user" }).update(first.id, {
      content: "이후 사용자 수정",
    });
    await expect(rememberTool.undo?.(first, ctx)).rejects.toThrow("변경");
    expect((await memoryService(ctx).get(first.id))?.content).toBe(
      "이후 사용자 수정",
    );
  });

  it("concurrent memory creation reports exactly one creator", async () => {
    const input = {
      creationKey: crypto.randomUUID(),
      kind: "fact",
      content: "동시 생성 고유 문장",
      importance: 3,
    };
    const results = await Promise.all([
      rememberTool.execute(input, ctx),
      rememberTool.execute(input, ctx),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(results.filter((r) => r.createdNow)).toHaveLength(1);
  });

  it("memory update Undo is field-only, preserves evidence and rejects later changes", async () => {
    const svc = memoryService({ ...ctx, actor: "user" });
    const { memory } = await svc.remember({
      creationKey: crypto.randomUUID(),
      kind: "fact",
      content: "직접 확인된 원래 기억",
      source: { type: "manual", evidence: "explicit_user" },
    });
    const update = memoryTools.update;
    if (!update) throw new Error("missing update tool");
    const pinned = await update.execute({ id: memory.id, pinned: true }, ctx);
    expect(Object.keys(pinned._before)).toEqual(["pinned"]);
    await update.undo?.(pinned, ctx);
    expect(await svc.get(memory.id)).toMatchObject({
      pinned: false,
      source: memory.source,
      confirmed_at: memory.confirmed_at,
    });
    const changed = await update.execute(
      { id: memory.id, content: "모델이 수정한 기억" },
      ctx,
    );
    await update.undo?.(changed, ctx);
    const restored = await svc.get(memory.id);
    expect(restored).toMatchObject({
      content: memory.content,
      source: memory.source,
      confirmed_at: memory.confirmed_at,
      embedding: memory.embedding,
      index_status: memory.index_status,
    });
    const stale = await update.execute({ id: memory.id, pinned: true }, ctx);
    await svc.update(memory.id, { content: "Undo보다 나중에 바꾼 기억" });
    await expect(update.undo?.(stale, ctx)).rejects.toThrow("변경");
    expect((await svc.get(memory.id))?.content).toBe(
      "Undo보다 나중에 바꾼 기억",
    );
  });
});
