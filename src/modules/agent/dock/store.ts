"use client";
import { create } from "zustand";

export interface UiContextState {
  route: string;
  entity?: { type: string; id: string };
}

interface DockState {
  open: boolean;
  threadId: string;
  /** 화면 컨텍스트(칩). 사용자가 끄면 전송하지 않는다 */
  ui: UiContextState | null;
  useUi: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setThread: (id: string) => void;
  newThread: () => void;
  setUi: (ui: UiContextState | null) => void;
  setUseUi: (v: boolean) => void;
}

export const useDock = create<DockState>((set) => ({
  open: false,
  threadId: crypto.randomUUID(),
  ui: null,
  useUi: true,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  setThread: (threadId) => set({ threadId }),
  newThread: () => set({ threadId: crypto.randomUUID() }),
  setUi: (ui) => set({ ui }),
  setUseUi: (useUi) => set({ useUi }),
}));
