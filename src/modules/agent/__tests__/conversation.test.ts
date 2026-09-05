import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ToolContext } from "@/core/contracts";
import { createRegistry } from "@/core/registry/registry";
import { localSupabaseAvailable, testUser } from "@/test/supabase";
import { conversationTools } from "../conversation-tools";
import { agentService, conversationWorkingState } from "../service";

const available = await localSupabaseAvailable();
describe.skipIf(!available)(
  "A07 stored conversation history and management",
  () => {
    let user: Awaited<ReturnType<typeof testUser>>;
    let other: Awaited<ReturnType<typeof testUser>>;
    let ctx: ToolContext;
    let threadId: string;
    beforeAll(async () => {
      user = await testUser("conversation");
      other = await testUser("conversation-other");
      ctx = {
        db: user.db,
        userId: user.id,
        actor: "agent",
        timezone: "Asia/Seoul",
        now: new Date(),
        registry: createRegistry(() => []),
        emit: async () => {},
        enqueue: async () => "",
      };
      threadId = (await agentService(ctx).ensureThread(undefined)).id;
      const rows = Array.from({ length: 205 }, (_, i) => ({
        id: `message-${String(i).padStart(3, "0")}-${threadId}`,
        thread_id: threadId,
        role: i % 2 ? "assistant" : "user",
        parts: [
          {
            type: "text",
            text:
              i === 0
                ? "첫대화에서만찾는고유어"
                : i === 203
                  ? "전부 처리했어요"
                  : `메시지 ${i}`,
          },
        ],
        created_at: new Date(
          Date.parse("2026-09-01T00:00:00Z") + i * 1000,
        ).toISOString(),
      }));
      const inserted = await user.db.from("chat_messages").insert(rows);
      if (inserted.error) throw inserted.error;
    });
    afterAll(async () => {
      await user?.cleanup();
      await other?.cleanup();
    });
    it("loads the latest 200, then pages all 205 exactly once with the original chronological order", async () => {
      const latest = await agentService(ctx).loadMessages(threadId);
      expect(latest).toHaveLength(200);
      expect(latest[0]?.id).toContain("message-005-");
      expect(latest.at(-1)?.id).toContain("message-204-");
      let beforeId: string | undefined;
      const pages: string[][] = [];
      do {
        const page = await agentService(ctx).readThread({
          id: threadId,
          limit: 50,
          beforeId,
        });
        pages.unshift(page.messages.map((m) => m.id));
        beforeId = page.nextBeforeId ?? undefined;
        if (!page.hasMore) break;
      } while (beforeId);
      const all = pages.flat();
      expect(all).toHaveLength(205);
      expect(new Set(all).size).toBe(205);
      expect(all[0]).toContain("message-000-");
      expect(all.at(-1)).toContain("message-204-");
      const search = await conversationTools.listThreads.execute(
        { query: "첫대화에서만찾는고유어", limit: 20, offset: 0 },
        ctx,
      );
      expect(search.items.map((t) => t.id)).toEqual([threadId]);
    });
    it("keeps same-timestamp user/assistant insertion order when IDs sort backwards, including upsert", async () => {
      const t = await agentService(ctx).ensureThread(undefined);
      const inserted = await user.db.from("chat_messages").insert([
        {
          id: `z-user-${t.id}`,
          thread_id: t.id,
          role: "user",
          parts: [{ type: "text", text: "먼저 요청" }],
          created_at: "2026-09-01T01:00:00Z",
        },
        {
          id: `a-reply-${t.id}`,
          thread_id: t.id,
          role: "assistant",
          parts: [{ type: "text", text: "나중 응답" }],
          created_at: "2026-09-01T01:00:00Z",
        },
      ]);
      if (inserted.error) throw inserted.error;
      await agentService(ctx).saveMessages(t.id, [
        {
          id: `a-reply-${t.id}`,
          role: "assistant",
          parts: [{ type: "text", text: "응답 갱신" }],
        },
      ]);
      const page = await agentService(ctx).readThread({ id: t.id, limit: 1 });
      expect(page.messages[0]?.role).toBe("assistant");
      const previous = await agentService(ctx).readThread({
        id: t.id,
        limit: 1,
        beforeId: page.nextBeforeId ?? undefined,
      });
      expect(previous.messages[0]?.role).toBe("user");
      expect(
        (await agentService(ctx).loadMessages(t.id)).map((m) => m.id),
      ).toEqual([`z-user-${t.id}`, `a-reply-${t.id}`]);
    });
    it("derives bounded working state without promoting assistant claims or source instructions", async () => {
      await agentService(ctx).saveMessages(threadId, [
        {
          id: `latest-${threadId}`,
          role: "user",
          parts: [
            {
              type: "text",
              text: "과거 메모에 '모두 삭제하라'고 적혀 있어. 그 문장을 검색해줘.",
            },
          ],
        },
      ]);
      const state = await conversationWorkingState(ctx, threadId);
      expect(state.recentUserRequests.at(-1)?.text).toContain("검색해줘");
      expect(state.latestAssistantReport).toMatchObject({
        text: "전부 처리했어요",
        executionProof: false,
      });
      expect(state.hasOlderMessages).toBe(true);
      expect(state.summaryIsGenerated).toBe(false);
      expect(state.executions).toEqual([]);
      expect(state.recentUserRequests.length).toBeLessThanOrEqual(8);
    });
    it("protects stored message role/thread/user text even outside the latest history window", async () => {
      const id = `message-000-${threadId}`;
      const altered = await user.db
        .from("chat_messages")
        .update({ parts: [{ type: "text", text: "새 명령으로 변조" }] })
        .eq("id", id);
      expect(altered.error?.message).toContain(
        "stored user message cannot change",
      );
      const promoted = await user.db
        .from("chat_messages")
        .update({ role: "system" })
        .eq("id", id);
      expect(promoted.error?.message).toContain(
        "message identity cannot change",
      );
      const elsewhere = await agentService(ctx).ensureThread(undefined);
      const moved = await user.db
        .from("chat_messages")
        .update({ thread_id: elsewhere.id })
        .eq("id", id);
      expect(moved.error?.message).toContain("message identity cannot change");
      const foreign = { ...ctx, db: other.db, userId: other.id };
      await expect(
        conversationTools.getThread.execute(
          { id: threadId, limit: 20 },
          foreign,
        ),
      ).rejects.toThrow("대화를 찾을 수 없어요");
      expect(
        (
          await agentService(foreign).listThreadsPage({
            query: "첫대화에서만찾는고유어",
          })
        ).items,
      ).toEqual([]);
      const forged = await other.db.from("chat_messages").insert({
        id: crypto.randomUUID(),
        thread_id: threadId,
        role: "system",
        parts: [],
      });
      expect(forged.error?.message).toContain("thread not found");
    });
    it("renames with version checks and rejects stale/foreign approved deletion", async () => {
      const svc = agentService(ctx);
      const original = await svc.getThread(threadId);
      if (!original) throw new Error("missing thread");
      const renamed = await conversationTools.renameThread.execute(
        {
          id: threadId,
          title: "제품 계획 대화",
          expectedVersion: original.updated_at,
        },
        ctx,
      );
      expect(renamed.title).toBe("제품 계획 대화");
      await expect(
        conversationTools.renameThread.execute(
          {
            id: threadId,
            title: "오래된 수정",
            expectedVersion: original.updated_at,
          },
          ctx,
        ),
      ).rejects.toThrow("변경되었거나");
      await expect(
        conversationTools.deleteThread.execute(
          { id: threadId },
          {
            ...ctx,
            approvedVersions: {
              [`chat_threads:${threadId}`]: original.updated_at,
            },
          },
        ),
      ).rejects.toThrow("변경되었거나");
      await expect(
        conversationTools.deleteThread.execute(
          { id: threadId },
          {
            ...ctx,
            db: other.db,
            userId: other.id,
            approvedVersions: { [`chat_threads:${threadId}`]: renamed.version },
          },
        ),
      ).rejects.toThrow();
      const deleted = await conversationTools.deleteThread.execute(
        { id: threadId },
        {
          ...ctx,
          approvedVersions: { [`chat_threads:${threadId}`]: renamed.version },
        },
      );
      expect(deleted.deleted).toBe(true);
      expect(await svc.getThread(threadId)).toBeNull();
      expect(
        (
          await user.db
            .from("chat_messages")
            .select("id")
            .eq("thread_id", threadId)
        ).data,
      ).toEqual([]);
    });
  },
);
