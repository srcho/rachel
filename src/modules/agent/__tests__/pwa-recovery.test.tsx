// @vitest-environment jsdom

import { Chat } from "@ai-sdk/react";
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RachelUIMessage } from "../agent";
import {
  getChatSession,
  mergeSavedMessages,
  peekChatSession,
} from "../dock/chat-session";
import { restoreDockSession, useDock } from "../dock/store";
import { useChatRecovery } from "../dock/useChatRecovery";
import { useKeyboardViewport } from "../dock/useKeyboardViewport";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../actions", () => ({ loadThreadAction: mocks.load }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;
const message = (
  id: string,
  text: string,
  role: "user" | "assistant" = "assistant",
): RachelUIMessage => ({ id, role, parts: [{ type: "text", text }] });
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  sessionStorage.clear();
  useDock.setState({
    userId: crypto.randomUUID(),
    conversations: {},
    drafts: {},
    open: false,
  });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
  mocks.load.mockResolvedValue([]);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function Recovery({ chat }: { chat: Chat<RachelUIMessage> }) {
  const state = useChatRecovery(chat, chat.messages);
  return <output>{state.notice}</output>;
}
async function tick(ms = 300) {
  await act(async () => vi.advanceTimersByTimeAsync(ms));
}

it("preserves the actual stream instance across dock, history and responsive remounts", () => {
  const original = getChatSession("same", [message("old", "처음")]);
  original.messages = [message("new", "진행 중인 응답")];
  expect(getChatSession("same", [message("old", "낡은 서버 사본")])).toBe(
    original,
  );
  expect(getChatSession("same", []).messages[0]?.id).toBe("new");
  useDock.setState({ userId: "different-user", conversations: {} });
  expect(peekChatSession("same")).toBeUndefined();
});

it("restores active thread and unsent input after reload, isolated by user", () => {
  const id = crypto.randomUUID();
  useDock.setState({
    userId: "owner",
    threadId: id,
    open: true,
    drafts: { [id]: "아직 보내지 않은 문장" },
  });
  useDock.setState({ userId: null, conversations: {}, drafts: {} });
  restoreDockSession("owner");
  expect(useDock.getState()).toMatchObject({
    threadId: id,
    open: true,
    drafts: { [id]: "아직 보내지 않은 문장" },
  });
  restoreDockSession("other");
  expect(useDock.getState().threadId).not.toBe(id);
  expect(useDock.getState().drafts).toEqual({});
});

it("merges updated server replies without losing older loaded pages or unsaved input", () => {
  expect(
    mergeSavedMessages(
      [
        message("old", "이전"),
        message("answer", "일부"),
        message("pending", "새 요청", "user"),
      ],
      [message("answer", "완료 응답")],
    ).map((m) => m.parts[0]),
  ).toEqual([
    { type: "text", text: "이전" },
    { type: "text", text: "완료 응답" },
    { type: "text", text: "새 요청" },
  ]);
});

it("reads saved messages on foreground return without resending a request", async () => {
  const chat = new Chat<RachelUIMessage>({
    id: "restore",
    messages: [message("u", "요청", "user")],
  });
  const send = vi.spyOn(chat, "sendMessage");
  mocks.load.mockResolvedValue([
    message("u", "요청", "user"),
    message("a", "저장된 답변"),
  ]);
  await act(async () => root.render(<Recovery chat={chat} />));
  await tick();
  expect(chat.messages.at(-1)?.id).toBe("a");
  mocks.load.mockResolvedValue([message("a", "앱 밖에서 마무리된 답변")]);
  await act(async () => window.dispatchEvent(new Event("pageshow")));
  await tick();
  expect(chat.messages.at(-1)?.parts[0]).toMatchObject({
    text: "앱 밖에서 마무리된 답변",
  });
  expect(send).not.toHaveBeenCalled();
});

it("does not overwrite a new message or approval while a foreground read is pending", async () => {
  let finish!: (messages: RachelUIMessage[]) => void;
  mocks.load.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const chat = new Chat<RachelUIMessage>({
    id: "race",
    messages: [message("a", "이전")],
  });
  await act(async () => root.render(<Recovery chat={chat} />));
  await tick();
  chat.messages = [message("a", "사용자가 승인한 새 상태")];
  await act(async () => finish([message("a", "낡은 상태")]));
  expect(chat.messages[0]?.parts[0]).toMatchObject({
    text: "사용자가 승인한 새 상태",
  });
});

it("picks up a reply persisted shortly after foreground return without replay", async () => {
  const user = message("u", "요청", "user");
  const chat = new Chat<RachelUIMessage>({ id: "late", messages: [user] });
  const send = vi.spyOn(chat, "sendMessage");
  mocks.load
    .mockResolvedValueOnce([user])
    .mockResolvedValue([user, message("a", "뒤늦게 저장된 답변")]);
  await act(async () => root.render(<Recovery chat={chat} />));
  await tick(3500);
  expect(chat.messages.at(-1)?.id).toBe("a");
  expect(mocks.load).toHaveBeenCalledTimes(2);
  expect(send).not.toHaveBeenCalled();
  expect(container.textContent).toBe("");
});

it("keeps input and messages on offline/error then recovers on online without reloading", async () => {
  const chat = new Chat<RachelUIMessage>({
    id: "offline",
    messages: [message("a", "기존 대화")],
  });
  useDock.getState().setDraft("offline", "입력 중");
  mocks.load.mockRejectedValue(new Error("offline"));
  await act(async () => root.render(<Recovery chat={chat} />));
  await tick();
  expect(container.textContent).toContain("유지했어요");
  expect(chat.messages[0]?.id).toBe("a");
  expect(useDock.getState().drafts.offline).toBe("입력 중");
  mocks.load.mockResolvedValue([message("a", "복구된 대화")]);
  await act(async () => window.dispatchEvent(new Event("online")));
  await tick();
  expect(container.textContent).toBe("");
  expect(chat.messages[0]?.parts[0]).toMatchObject({ text: "복구된 대화" });
});

it("stops a stalled local stream and checks saved results without replaying mutations", async () => {
  const chat = new Chat<RachelUIMessage>({
    id: "stalled",
    messages: [message("u", "요청", "user")],
  });
  let status = "streaming";
  vi.spyOn(chat, "status", "get").mockImplementation(
    () => status as "streaming" | "ready",
  );
  const stop = vi.spyOn(chat, "stop").mockImplementation(async () => {
    status = "ready";
  });
  const send = vi.spyOn(chat, "sendMessage");
  mocks.load.mockResolvedValue([
    message("u", "요청", "user"),
    message("a", "실제 저장 결과"),
  ]);
  await act(async () => root.render(<Recovery chat={chat} />));
  await tick(60_000);
  expect(stop).not.toHaveBeenCalled();
  await tick(62_000);
  expect(stop).toHaveBeenCalledTimes(1);
  expect(chat.messages.at(-1)?.id).toBe("a");
  expect(send).not.toHaveBeenCalled();
});

it("recomputes drawer geometry after keyboard close, rotation and foreground resume", async () => {
  const viewport = Object.assign(new EventTarget(), {
    width: 375,
    height: 430,
    offsetTop: 0,
    offsetLeft: 0,
  });
  vi.stubGlobal("visualViewport", viewport);
  vi.stubGlobal("innerHeight", 812);
  function Panel() {
    const ref = useRef<HTMLDivElement>(null);
    useKeyboardViewport(ref, true);
    return <div ref={ref} />;
  }
  await act(async () => root.render(<Panel />));
  await tick(20);
  const panel = container.firstElementChild as HTMLElement;
  expect(panel.style.height).toBe("430px");
  expect(panel.style.bottom).toBe("382px");
  viewport.height = 812;
  await act(async () => window.dispatchEvent(new Event("pageshow")));
  await tick(20);
  expect(panel.style.bottom).toBe("0px");
  expect(Number.parseFloat(panel.style.height)).toBeCloseTo(714.56);
  viewport.width = 812;
  viewport.height = 375;
  vi.stubGlobal("innerHeight", 375);
  await act(async () => viewport.dispatchEvent(new Event("resize")));
  await tick(20);
  expect(panel.style.width).toBe("812px");
  expect(panel.style.height).toBe("330px");
});
