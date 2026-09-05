"use client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { loadThreadAction } from "../actions";
import type { RachelUIMessage } from "../agent";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import { useDock } from "./store";

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
  const saved = useDock.getState().conversations[threadId] ?? [];
  const cached = useRef(
    initialMessages.length >= saved.length ? initialMessages : saved,
  );
  const ui = useDock((s) => s.ui);
  const useUi = useDock((s) => s.useUi);
  const uiRef = useRef({ ui, useUi });
  uiRef.current = { ui, useUi };

  const transportRef = useRef(
    new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ id, messages, trigger }) => ({
        body: {
          id,
          messages,
          retry: trigger === "regenerate-message",
          ui: uiRef.current.useUi ? (uiRef.current.ui ?? undefined) : undefined,
        },
      }),
    }),
  );

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
    id: threadId,
    messages: cached.current,
    transport: transportRef.current,
  });

  useEffect(() => {
    setMessages(threadId, messages);
  }, [threadId, messages, setMessages]);

  useEffect(() => {
    if (error) toast.error(`레이첼 응답 실패: ${error.message}`);
  }, [error]);

  const busy = status === "submitted" || status === "streaming";
  return (
    <>
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
      <Composer
        text={draft}
        onTextChange={(text) => setDraft(threadId, text)}
        onSend={(text) => void sendMessage({ text })}
        onStop={stop}
        busy={busy}
        autoFocus={autoFocus}
      />
    </>
  );
}
