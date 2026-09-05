"use client";
import { History, Maximize2, Minimize2, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useIsDesktop } from "@/core/ui/useMediaQuery";
import { DEFAULT_TZ, fmtDateTime } from "@/core/utils/date";
import { cn } from "@/lib/utils";
import { listThreadsAction, loadThreadAction } from "../actions";
import type { RachelUIMessage } from "../agent";
import { Chat } from "./Chat";
import { peekChatSession } from "./chat-session";
import { useDock } from "./store";

type ThreadItem = { id: string; title: string; lastMessageAt: string };

export default function DockBody({ onClose }: { onClose: () => void }) {
  const {
    threadId,
    setThread,
    newThread,
    ui,
    useUi,
    setUseUi,
    expanded,
    toggleExpanded,
  } = useDock();
  const isDesktop = useIsDesktop();
  const [initial, setInitial] = useState<{
    threadId: string;
    messages: RachelUIMessage[];
  } | null>(null);
  const [threads, setThreads] = useState<ThreadItem[] | null>(null);
  const [showThreads, setShowThreads] = useState(false);
  const [threadsError, setThreadsError] = useState(false);
  const [threadsRetry, setThreadsRetry] = useState(0);

  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 재시도는 같은 조회를 다시 실행한다
  useEffect(() => {
    let active = true;
    setLoadError(false);
    const cached =
      peekChatSession(threadId)?.messages ??
      useDock.getState().conversations[threadId];
    if (cached) {
      setInitial({ threadId, messages: cached });
      return;
    }
    setInitial(null);
    let timeout: ReturnType<typeof setTimeout>;
    void Promise.race([
      loadThreadAction(threadId),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("timeout")), 10_000);
      }),
    ])
      .then((messages) => {
        if (active)
          setInitial({ threadId, messages: messages as RachelUIMessage[] });
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [threadId, retry]);
  function switchThread(id: string) {
    setThread(id);
    setShowThreads(false);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: explicit retry reloads the visible list.
  useEffect(() => {
    if (!showThreads) return;
    let active = true;
    let timeout: ReturnType<typeof setTimeout>;
    setThreadsError(false);
    void Promise.race([
      listThreadsAction(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("timeout")), 10_000);
      }),
    ])
      .then((rows) => {
        if (active) setThreads(rows);
      })
      .catch(() => {
        if (active) setThreadsError(true);
      })
      .finally(() => clearTimeout(timeout));
    const resume = () => {
      if (document.visibilityState === "visible" && navigator.onLine)
        setThreadsRetry((n) => n + 1);
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("online", resume);
    return () => {
      active = false;
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("online", resume);
    };
  }, [showThreads, threadsRetry]);

  const contextLabel =
    ui?.label ??
    (ui?.entity
      ? ui.entity.type === "board"
        ? "이 보드"
        : "이 회의"
      : ui?.route === "/today"
        ? "오늘"
        : null);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-11 shrink-0 items-center gap-1 border-b px-2">
        <span className="px-1 text-sm font-semibold">레이첼</span>
        {contextLabel && (
          <button
            type="button"
            onClick={() => setUseUi(!useUi)}
            className={cn(
              "max-w-40 truncate rounded-md border px-2 py-1.5 text-xs",
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
            onClick={() => setShowThreads((value) => !value)}
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
              setInitial(null);
              setShowThreads(false);
            }}
            aria-label="새 대화"
          >
            <Plus className="size-4" />
          </Button>
          {isDesktop && (
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={toggleExpanded}
              aria-label={expanded ? "작게" : "크게"}
            >
              {expanded ? (
                <Minimize2 className="size-4" />
              ) : (
                <Maximize2 className="size-4" />
              )}
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={onClose}
            aria-label="닫기 (Esc)"
          >
            <X className="size-4" />
          </Button>
        </div>
      </header>
      {showThreads ? (
        <ul className="flex-1 overflow-y-auto p-2 text-sm">
          {threadsError && (
            <li role="alert" className="p-2">
              대화 목록을 불러오지 못했어요.
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setThreadsRetry((n) => n + 1)}
              >
                다시 불러오기
              </Button>
            </li>
          )}
          {threads === null && !threadsError && (
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
                  {fmtDateTime(t.lastMessageAt, DEFAULT_TZ)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : loadError ? (
        <p className="p-4 text-sm">
          대화를 불러오지 못했어요.{" "}
          <button
            type="button"
            className="min-h-9 underline"
            onClick={() => setRetry((n) => n + 1)}
          >
            다시 불러오기
          </button>
        </p>
      ) : initial?.threadId !== threadId ? (
        <p className="flex-1 p-4 text-sm text-muted-foreground">
          대화를 불러오는 중…
        </p>
      ) : (
        <Chat
          key={threadId}
          threadId={threadId}
          initialMessages={initial.messages}
          autoFocus={isDesktop}
        />
      )}
    </div>
  );
}
