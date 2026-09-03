"use client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
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
  const ui = useDock((s) => s.ui);
  const useUi = useDock((s) => s.useUi);
  const uiRef = useRef({ ui, useUi });
  uiRef.current = { ui, useUi };

  const transportRef = useRef(
    new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ id, messages }) => ({
        body: {
          id,
          messages,
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
    addToolApprovalResponse,
  } = useChat<RachelUIMessage>({
    id: threadId,
    messages: initialMessages,
    transport: transportRef.current,
  });

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
      <Composer
        onSend={(text) => void sendMessage({ text })}
        onStop={stop}
        busy={busy}
        autoFocus={autoFocus}
      />
    </>
  );
}
