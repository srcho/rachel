"use client";
import { Chat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import type { RachelUIMessage } from "../agent";
import { useDock } from "./store";

// A view may unmount while the request is still running (drawer, history, rotation).
// Keep the actual SDK stream and approval state, not just a copy of its messages.
const sessions = new Map<string, Chat<RachelUIMessage>>();
export const peekChatSession = (id: string) => sessions.get(id);

export function getChatSession(id: string, messages: RachelUIMessage[]) {
  const existing = sessions.get(id);
  if (existing) return existing;
  const owner = useDock.getState().userId;
  const chat = new Chat<RachelUIMessage>({
    id,
    messages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ id, messages, trigger }) => {
        const { ui, useUi } = useDock.getState();
        return {
          body: {
            id,
            messages: messages.slice(-200),
            retry: trigger === "regenerate-message",
            ui: useUi ? (ui ?? undefined) : undefined,
          },
        };
      },
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: ({ messages }) => {
      if (useDock.getState().userId === owner && sessions.get(id) === chat)
        useDock.getState().setMessages(id, messages);
    },
  });
  sessions.set(id, chat);
  return chat;
}

useDock.subscribe((state, previous) => {
  for (const [id, chat] of sessions) {
    if (
      state.userId !== previous.userId ||
      (previous.conversations[id] && !state.conversations[id])
    ) {
      sessions.delete(id);
      void chat.stop();
    }
  }
});

/** Server rows replace their matching messages; locally loaded older pages remain. */
export function mergeSavedMessages(
  current: RachelUIMessage[],
  saved: RachelUIMessage[],
): RachelUIMessage[] {
  const byId = new Map(saved.map((message) => [message.id, message]));
  const ids = new Set(current.map((message) => message.id));
  return [
    ...current.map((message) => byId.get(message.id) ?? message),
    ...saved.filter((message) => !ids.has(message.id)),
  ];
}
