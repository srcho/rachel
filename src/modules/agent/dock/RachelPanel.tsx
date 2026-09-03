"use client";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsDesktop } from "@/core/ui/useMediaQuery";
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
    const m = /^\/(tasks|meetings)\/([0-9a-f-]{36})/.exec(pathname);
    setUi({
      route: pathname,
      entity: m
        ? { type: m[1] === "tasks" ? "board" : "meeting", id: m[2] ?? "" }
        : undefined,
    });
  }, [pathname, setUi]);
}

/** 데스크톱: 우측 패널. 모바일: 바텀 드로어. ⌘J 로 토글. */
export function RachelPanel() {
  const isDesktop = useIsDesktop();
  const { open, setOpen, toggle } = useDock();
  useUiContextSync();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  if (isDesktop) {
    if (!open) return null;
    return (
      <aside
        className="sticky top-0 hidden h-dvh w-[400px] shrink-0 border-l bg-background md:block"
        aria-label="레이첼"
      >
        <DockBody onClose={() => setOpen(false)} />
      </aside>
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
