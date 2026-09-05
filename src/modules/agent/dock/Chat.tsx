"use client";
import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { loadThreadAction } from "../actions";
import type { RachelUIMessage } from "../agent";
import { Composer } from "./Composer";
import { getChatSession } from "./chat-session";
import { ExecutionRecords } from "./ExecutionRecords";
import { MessageList } from "./MessageList";
import { useDock } from "./store";
import { useChatRecovery } from "./useChatRecovery";

/** 스레드 하나의 대화. threadId 가 바뀌면 key 로 다시 마운트한다. */
export function Chat({
  threadId,
  initialMessages,
  autoFocus,
}: {
  threadId: string;
  initialMessages: RachelUIMessage[];
  autoFocus?: boolean;
}) {
  const draft = useDock((s) => s.drafts[threadId] ?? "");
  const setDraft = useDock((s) => s.setDraft);
  const setMessages = useDock((s) => s.setMessages);
  const removeThread = useDock((s) => s.removeThread);
  const saved = useDock.getState().conversations[threadId] ?? [];
  const cached = useRef(initialMessages.length ? initialMessages : saved);
  const [hasOlder, setHasOlder] = useState(initialMessages.length >= 200);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [session] = useState(() => getChatSession(threadId, cached.current));

  const {
    messages,
    sendMessage,
    status,
    stop,
    error,
    regenerate,
    setMessages: replaceMessages,
    addToolApprovalResponse,
  } = useChat<RachelUIMessage>({
    chat: session,
  });
  const recovery = useChatRecovery(session, messages);

  useEffect(() => {
    setMessages(threadId, messages);
  }, [threadId, messages, setMessages]);

  useEffect(() => {
    if (error) toast.error(`레이첼 응답 실패: ${error.message}`);
  }, [error]);

  const busy = status === "submitted" || status === "streaming";
  useEffect(() => {
    if (busy) return;
    const deleted = messages.some((message) =>
      message.parts.some((part) => {
        if (part.type !== "tool-agent_deleteThread") return false;
        const result = part as unknown as {
          state: string;
          output?: { id?: string; deleted?: boolean };
        };
        return (
          result.state === "output-available" &&
          result.output?.id === threadId &&
          result.output.deleted === true
        );
      }),
    );
    if (deleted) {
      removeThread(threadId);
      toast.success("대화를 삭제했어요. 새 대화를 시작할 수 있어요.");
    }
  }, [busy, messages, removeThread, threadId]);
  return (
    <>
      {recovery.notice && (
        <output className="shrink-0 border-b px-3 py-2 text-sm">
          {recovery.notice}
          {!recovery.checking && (
            <Button size="sm" variant="ghost" onClick={recovery.refresh}>
              다시 확인
            </Button>
          )}
        </output>
      )}
      {hasOlder && (
        <Button
          variant="ghost"
          size="sm"
          disabled={loadingOlder || busy}
          onClick={async () => {
            setLoadingOlder(true);
            try {
              const older = await loadThreadAction(threadId, messages[0]?.id);
              replaceMessages((current) => [
                ...(older as RachelUIMessage[]),
                ...current.filter((m) => !older.some((o) => o.id === m.id)),
              ]);
              setHasOlder(older.length === 200);
            } catch {
              toast.error("이전 대화를 불러오지 못했어요.");
            } finally {
              setLoadingOlder(false);
            }
          }}
        >
          이전 대화 보기
        </Button>
      )}
      <MessageList
        messages={messages}
        status={status}
        onApprove={(id, approved) => addToolApprovalResponse({ id, approved })}
      />
      {error && !busy && (
        <div role="alert" className="border-t px-3 py-2 text-xs">
          <p>응답이 중단됐어요. 완료된 변경은 유지됩니다.</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <Button size="sm" variant="ghost" onClick={() => void regenerate()}>
              다시 받기
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const last = [...messages]
                  .reverse()
                  .find((m) => m.role === "user");
                setDraft(
                  threadId,
                  last?.parts
                    .filter((p) => p.type === "text")
                    .map((p) => p.text)
                    .join("\n") ?? "",
                );
              }}
            >
              편집해서 새로 보내기
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                try {
                  const saved = await loadThreadAction(threadId);
                  replaceMessages(saved as RachelUIMessage[]);
                } catch {
                  toast.error("저장된 응답을 불러오지 못했어요");
                }
              }}
            >
              저장된 응답 불러오기
            </Button>
          </div>
        </div>
      )}
      <ExecutionRecords threadId={threadId} disabled={busy} />
      <Composer
        text={draft}
        onTextChange={(text) => setDraft(threadId, text)}
        onSend={(text) => void sendMessage({ text })}
        onStop={stop}
        busy={busy}
        disabled={!recovery.online || recovery.checking}
        autoFocus={autoFocus}
      />
    </>
  );
}
