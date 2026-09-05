"use client";
import { create } from "zustand";
import type { UiContext } from "@/core/contracts";
import type { RachelUIMessage } from "../agent";

export type UiContextState = UiContext;

interface DockState {
  userId: string | null;
  open: boolean;
  /** 데스크톱 플로팅 창 확장(넓게·높게) */
  expanded: boolean;
  threadId: string;
  drafts: Record<string, string>;
  conversations: Record<string, RachelUIMessage[]>;
  setDraft: (id: string, text: string) => void;
  setMessages: (id: string, messages: RachelUIMessage[]) => void;
  /** 화면 컨텍스트(칩). 사용자가 끄면 전송하지 않는다 */
  ui: UiContextState | null;
  useUi: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  toggleExpanded: () => void;
  setThread: (id: string) => void;
  newThread: () => void;
  removeThread: (id: string) => void;
  setUi: (ui: UiContextState | null) => void;
  setUseUi: (v: boolean) => void;
}

export const useDock = create<DockState>((set) => ({
  userId: null,
  open: false,
  expanded: false,
  threadId: crypto.randomUUID(),
  drafts: {},
  conversations: {},
  setDraft: (id, text) => set((s) => ({ drafts: { ...s.drafts, [id]: text } })),
  setMessages: (id, messages) =>
    set((s) => ({ conversations: { ...s.conversations, [id]: messages } })),
  ui: null,
  useUi: true,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  toggleExpanded: () => set((s) => ({ expanded: !s.expanded })),
  setThread: (threadId) => set({ threadId }),
  newThread: () => set({ threadId: crypto.randomUUID() }),
  removeThread: (id) =>
    set((state) => {
      const conversations = { ...state.conversations };
      const drafts = { ...state.drafts };
      delete conversations[id];
      delete drafts[id];
      return {
        conversations,
        drafts,
        threadId: state.threadId === id ? crypto.randomUUID() : state.threadId,
      };
    }),
  setUi: (ui) => set({ ui }),
  setUseUi: (useUi) => set({ useUi }),
}));

/** Restore this user's active conversation after a PWA page/process reload. */
export function restoreDockSession(userId: string) {
  if (useDock.getState().userId === userId) return;
  let saved: { threadId?: string; draft?: string; open?: boolean } = {};
  try {
    saved = JSON.parse(sessionStorage.getItem(`rachel-dock:${userId}`) ?? "{}");
  } catch {
    // Storage can be unavailable in private mode; the live conversation still works.
  }
  const id =
    typeof saved?.threadId === "string" &&
    /^[0-9a-f-]{36}$/i.test(saved.threadId)
      ? saved.threadId
      : crypto.randomUUID();
  useDock.setState({
    userId,
    threadId: id,
    drafts: typeof saved?.draft === "string" ? { [id]: saved.draft } : {},
    conversations: {},
    open: saved?.open === true,
  });
}

useDock.subscribe((state, previous) => {
  if (!state.userId || typeof sessionStorage === "undefined") return;
  if (
    state.userId === previous.userId &&
    state.threadId === previous.threadId &&
    state.open === previous.open &&
    state.drafts === previous.drafts
  )
    return;
  try {
    sessionStorage.setItem(
      `rachel-dock:${state.userId}`,
      JSON.stringify({
        threadId: state.threadId,
        draft: state.drafts[state.threadId] ?? "",
        open: state.open,
      }),
    );
  } catch {
    // Do not drop input when the browser refuses session storage.
  }
});
