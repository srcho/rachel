"use client";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsDesktop } from "@/core/ui/useMediaQuery";
import { cn } from "@/lib/utils";
import { useDock } from "./store";

/** Dock 본문(AI SDK·채팅)은 처음 열 때 로드한다 — 모든 라우트의 첫 JS 를 줄인다 */
const DockBody = dynamic(() => import("./DockBody"), {
  ssr: false,
  loading: () => (
    <p className="p-4 text-sm text-muted-foreground">레이첼을 불러오는 중…</p>
  ),
});

function useUiContextSync() {
  const pathname = usePathname();
  const setUi = useDock((s) => s.setUi);
  useEffect(() => {
    if (useDock.getState().ui?.route === pathname) return;
    const m = /^\/(tasks|meetings)\/([0-9a-f-]{36})/.exec(pathname);
    setUi({
      route: pathname,
      entity: m
        ? { type: m[1] === "tasks" ? "board" : "meeting", id: m[2] ?? "" }
        : undefined,
    });
  }, [pathname, setUi]);
}

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT"
  );
}

/**
 * 데스크톱: 우하단 플로팅 창(⇧Space · ⌘J 토글, Esc 닫기). 화면과 독립적이라 어디서든 바로 말을 건다.
 * 열기 버튼은 우하단 FAB(RachelFab).
 * 모바일: 바텀 드로어(FAB).
 */
export function RachelPanel({ userId }: { userId: string }) {
  const isDesktop = useIsDesktop();
  const { open, setOpen, toggle, expanded } = useDock();
  const panelRef = useRef<HTMLDivElement>(null);
  useUiContextSync();
  useEffect(() => {
    if (useDock.getState().userId !== userId)
      useDock.setState({
        userId,
        drafts: {},
        conversations: {},
        threadId: crypto.randomUUID(),
        open: false,
      });
  }, [userId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j";
      // 입력 중에는 Shift+Space 가 그냥 공백이어야 한다
      const shiftSpace =
        e.shiftKey &&
        (e.key === " " || e.code === "Space") &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isEditable(e.target);
      if (meta || shiftSpace) {
        e.preventDefault();
        toggle();
        return;
      }
      if (
        e.key === "Escape" &&
        useDock.getState().open &&
        panelRef.current?.contains(document.activeElement)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, setOpen]);

  if (isDesktop) {
    return (
      <>
        {open && (
          <div
            ref={panelRef}
            role="dialog"
            aria-label="레이첼"
            className={cn(
              "fixed right-4 bottom-4 z-50 hidden flex-col overflow-hidden rounded-xl border bg-background md:flex",
              expanded
                ? "h-[calc(100dvh-2rem)] w-[min(640px,calc(100vw-2rem))]"
                : "h-[min(600px,calc(100dvh-2rem))] w-[400px]",
            )}
          >
            <DockBody onClose={() => setOpen(false)} />
          </div>
        )}
      </>
    );
  }
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent className="h-[88dvh]">
        <DrawerHeader className="sr-only">
          <DrawerTitle>레이첼</DrawerTitle>
        </DrawerHeader>
        <DockBody onClose={() => setOpen(false)} />
      </DrawerContent>
    </Drawer>
  );
}
