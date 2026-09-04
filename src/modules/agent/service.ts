import type { ServiceContext } from "@/core/contracts";
import type { Json } from "@/core/db/types.generated";
import { agentRepository, type MessageRow, type ThreadRow } from "./repository";

export interface UiMessageLike {
  id: string;
  role: "user" | "assistant" | "system";
  parts: unknown[];
}

/** 스레드·메시지 관리. 토큰 압축(요약)은 S1.4 후반/P4 에서. */
export function agentService(ctx: ServiceContext) {
  const repo = agentRepository(ctx.db, ctx.userId);

  async function ensureThread(
    threadId: string | undefined,
    scope?: Json | null,
  ): Promise<ThreadRow> {
    if (threadId) {
      const t = await repo.getThread(threadId);
      if (t) return t;
      return repo.createThread({ id: threadId, scope });
    }
    return repo.createThread({ scope });
  }

  /** 클라이언트가 보낸 UI 메시지 전체를 upsert 하고(신규만 실제 insert) last_message_at 갱신 */
  async function saveMessages(
    threadId: string,
    messages: UiMessageLike[],
  ): Promise<void> {
    // 턴마다 대화 전체를 다시 쓰지 않는다: 마지막 사용자·어시스턴트 메시지(새 것)만
    const tail = messages.slice(-2);
    await repo.insertMessages(
      tail.map((m) => ({
        id: m.id,
        thread_id: threadId,
        role: m.role,
        parts: m.parts as Json,
      })),
    );
    const patch: Parameters<typeof repo.updateThread>[1] = {
      last_message_at: ctx.now.toISOString(),
    };
    const thread = await repo.getThread(threadId);
    if (thread && !thread.title) {
      const first = messages.find((m) => m.role === "user");
      const text = (
        first?.parts as Array<{ type: string; text?: string }> | undefined
      )?.find((p) => p.type === "text")?.text;
      if (text) patch.title = text.slice(0, 60);
    }
    await repo.updateThread(threadId, patch);
  }

  async function loadMessages(threadId: string): Promise<UiMessageLike[]> {
    const rows = await repo.listMessages(threadId);
    return rows.map(toUi);
  }

  return {
    ensureThread,
    saveMessages,
    loadMessages,
    listThreads: (limit?: number) => repo.listThreads(limit),
    getThread: (id: string) => repo.getThread(id),
    deleteThread: (id: string) => repo.deleteThread(id),
  };
}

export function toUi(row: MessageRow): UiMessageLike {
  return {
    id: row.id,
    role: row.role as UiMessageLike["role"],
    parts: (row.parts as unknown[]) ?? [],
  };
}
