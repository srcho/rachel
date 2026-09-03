"use client";
import { History, Plus, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsDesktop } from "@/core/ui/useMediaQuery";
import { cn } from "@/lib/utils";
import { listThreadsAction, loadThreadAction } from "../actions";
import type { RachelUIMessage } from "../agent";
import { Chat } from "./Chat";
import { useDock } from "./store";

type ThreadItem = { id: string; title: string; lastMessageAt: string };

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

function DockBody({ onClose }: { onClose: () => void }) {
  const { threadId, setThread, newThread, ui, useUi, setUseUi } = useDock();
  const [initial, setInitial] = useState<RachelUIMessage[] | null>([]);
  const [threads, setThreads] = useState<ThreadItem[] | null>(null);
  const [showThreads, setShowThreads] = useState(false);

  const switchThread = useCallback(
    async (id: string) => {
      setInitial(null);
      const msgs = await loadThreadAction(id);
      setThread(id);
      setInitial(msgs as unknown as RachelUIMessage[]);
      setShowThreads(false);
    },
    [setThread],
  );

  async function openThreads() {
    setShowThreads((v) => !v);
    if (!threads) setThreads(await listThreadsAction());
  }

  const contextLabel = ui?.entity
    ? ui.entity.type === "board"
      ? "이 보드"
      : "이 회의"
    : ui?.route === "/today"
      ? "Today"
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-1 border-b px-2 py-1.5">
        <span className="px-1 text-sm font-semibold">레이첼</span>
        {contextLabel && (
          <button
            type="button"
            onClick={() => setUseUi(!useUi)}
            className={cn(
              "rounded-full border px-2 py-px text-[11px]",
              useUi
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "text-muted-foreground line-through",
            )}
            title="화면 컨텍스트를 레이첼에게 알려줘요. 눌러서 끄기/켜기"
          >
            {contextLabel}
          </button>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={openThreads}
            aria-label="대화 목록"
          >
            <History className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={() => {
              newThread();
              setInitial([]);
              setShowThreads(false);
            }}
            aria-label="새 대화"
          >
            <Plus className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={onClose}
            aria-label="닫기"
          >
            <X className="size-4" />
          </Button>
        </div>
      </header>
      {showThreads ? (
        <ul className="flex-1 overflow-y-auto p-2 text-sm">
          {threads === null && (
            <li className="p-2 text-muted-foreground">불러오는 중…</li>
          )}
          {threads?.length === 0 && (
            <li className="p-2 text-muted-foreground">아직 대화가 없어요.</li>
          )}
          {threads?.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => void switchThread(t.id)}
                className={cn(
                  "w-full rounded-md px-2 py-1.5 text-left hover:bg-accent",
                  t.id === threadId && "bg-accent",
                )}
              >
                <span className="block truncate">{t.title}</span>
                <span className="text-[11px] text-muted-foreground">
                  {new Date(t.lastMessageAt).toLocaleString("ko-KR", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : initial === null ? (
        <p className="flex-1 p-4 text-sm text-muted-foreground">
          대화를 불러오는 중…
        </p>
      ) : (
        <Chat
          key={threadId}
          threadId={threadId}
          initialMessages={initial}
          autoFocus
        />
      )}
    </div>
  );
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
