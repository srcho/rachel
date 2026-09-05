"use client";
import { Archive, Pin, PinOff, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/core/ui/Panel";
import { DEFAULT_TZ, fmtDateTime } from "@/core/utils/date";
import { cn } from "@/lib/utils";
import { useDock } from "@/modules/agent/dock/store";
import {
  archiveMemoryAction,
  forgetMemoryAction,
  memoryReviewAction,
  memoryReviewOriginalAction,
  rememberAction,
  updateMemoryAction,
} from "../actions";
import { KIND_LABEL, MEMORY_KINDS, type MemoryKind } from "../constants";
import type { MemoryRow } from "../repository";
import type { MemorySource } from "../schema";

function sourceHref(s: MemorySource): string | null {
  if (s.type === "meeting" && s.id) return `/meetings/${s.id}`;
  if (s.type === "capture" && s.id) return `/capture/${s.id}`;
  return null;
}

export function MemoryList({
  memories,
  kind,
  q,
  archived,
}: {
  memories: MemoryRow[];
  kind: MemoryKind | null;
  q: string;
  archived: boolean;
}) {
  const router = useRouter();
  useEffect(() => {
    const id = window.location.hash.match(/^#memory-([0-9a-f-]{36})$/i)?.[1];
    if (id && !memories.some((m) => m.id === id))
      router.replace(`/memory?id=${id}#memory-${id}`);
  }, [memories, router]);
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newKind, setNewKind] = useState<MemoryKind>("fact");

  const field =
    "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/50";
  const param = (k: MemoryKind | null, a = archived) =>
    `/memory?${new URLSearchParams({ ...(k ? { kind: k } : {}), ...(q ? { q } : {}), ...(a ? { archived: "1" } : {}) })}`;

  return (
    <div className="space-y-3">
      <form
        className="flex gap-2 rounded-lg border bg-card p-2"
        onSubmit={(e) => {
          e.preventDefault();
          const c = newContent.trim();
          if (!c) return;
          start(async () => {
            try {
              const r = await rememberAction(c, newKind);
              setNewContent("");
              toast.success(
                r.review
                  ? "비슷한 기억이 있어요. 대체할지 확인해 주세요."
                  : "기억했어요",
              );
            } catch {
              toast.error("저장하지 못했어요. 입력한 내용을 유지했어요.");
            }
          });
        }}
      >
        <select
          className="h-8 w-24 rounded-md border bg-background px-2 text-sm"
          value={newKind}
          onChange={(e) => setNewKind(e.target.value as MemoryKind)}
        >
          {MEMORY_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <input
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          className="h-8 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none"
          placeholder="레이첼이 기억할 것 (예: 아침 회의는 피한다)"
          aria-label="새 기억"
        />
        <Button
          type="submit"
          size="sm"
          disabled={pending || !newContent.trim()}
        >
          기억
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-1">
        <Badge
          asChild
          variant={kind === null && !archived ? "default" : "outline"}
        >
          <Link href={param(null)}>전체</Link>
        </Badge>
        {MEMORY_KINDS.map((k) => (
          <Badge
            key={k}
            asChild
            variant={kind === k && !archived ? "default" : "outline"}
          >
            <Link href={param(k)}>{KIND_LABEL[k]}</Link>
          </Badge>
        ))}
        <Badge
          asChild
          variant={archived ? "secondary" : "ghost"}
          className="ml-auto"
        >
          <Link href={param(null, !archived)}>보관함</Link>
        </Badge>
      </div>

      {memories.length === 0 ? (
        <Panel>
          <p className="py-6 text-center text-sm text-muted-foreground">
            {q
              ? "검색 결과가 없어요."
              : "아직 기억이 없어요. 대화와 회의에서 자동으로 쌓여요."}
          </p>
        </Panel>
      ) : (
        <Panel bodyClassName="px-0 pb-0">
          <ul className="divide-y">
            {memories.map((m) => {
              const sources = (
                Array.isArray(m.source)
                  ? m.source
                  : m.source && Object.keys(m.source as object).length
                    ? [m.source]
                    : []
              ) as MemorySource[];
              return (
                <li
                  id={`memory-${m.id}`}
                  key={m.id}
                  className={cn(
                    "space-y-1 px-3 py-2.5 text-sm",
                    pending && "opacity-70",
                  )}
                >
                  {m.review_against && (
                    <MemoryReview id={m.id} content={m.content} />
                  )}
                  {m.kind === "fact" &&
                    Date.now() - Date.parse(m.confirmed_at ?? m.updated_at) >
                      90 * 86400000 && (
                      <p className="text-xs text-muted-foreground">
                        90일 이상 확인하지 않은 사실 · 지금도 맞는지 확인해
                        주세요.
                      </p>
                    )}
                  {m.kind === "preference" && m.confirmed_at && (
                    <p className="text-xs text-muted-foreground">
                      직접 확인한 선호
                    </p>
                  )}
                  {!m.confirmed_at && !m.invalidated_at && (
                    <p className="text-xs text-muted-foreground">
                      아직 직접 확인하지 않은 후보
                    </p>
                  )}
                  {m.invalidated_at && (
                    <p className="text-xs text-muted-foreground">
                      원본 변경으로 보관됨 · 현재 사실로 사용하지 않아요
                    </p>
                  )}
                  {m.index_status === "pending" && (
                    <p className="text-xs text-muted-foreground">
                      저장됨 · 의미 검색 준비 중
                    </p>
                  )}
                  <div className="flex items-start gap-2">
                    <Badge variant="secondary" className="mt-0.5 shrink-0">
                      {KIND_LABEL[m.kind as MemoryKind] ?? m.kind}
                    </Badge>
                    {editing === m.id ? (
                      <form
                        className="flex flex-1 gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          start(async () => {
                            try {
                              await updateMemoryAction(m.id, {
                                content: draft.trim(),
                              });
                              setEditing(null);
                            } catch {
                              toast.error(
                                "수정하지 못했어요. 다시 시도해 주세요.",
                              );
                            }
                          });
                        }}
                      >
                        <input
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          className={field}
                        />
                        <Button type="submit" size="sm">
                          저장
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditing(null)}
                        >
                          취소
                        </Button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="flex-1 text-left leading-relaxed"
                        onClick={() => {
                          setEditing(m.id);
                          setDraft(m.content);
                        }}
                      >
                        {m.content}
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-1 text-[11px] text-muted-foreground">
                    <span title="중요도">{"★".repeat(m.importance)}</span>
                    <span>{fmtDateTime(m.updated_at, DEFAULT_TZ, "date")}</span>
                    {m.use_count > 0 && <span>{m.use_count}회 사용</span>}
                    {sources.map((s, i) => {
                      const href = sourceHref(s);
                      const label =
                        s.type === "meeting"
                          ? "회의"
                          : s.type === "thread"
                            ? "대화"
                            : s.type === "capture"
                              ? "캡처"
                              : s.type === "inference"
                                ? "추론"
                                : "직접";
                      return href ? (
                        <Link
                          key={`${s.type}-${s.id ?? i}`}
                          href={href}
                          className="underline"
                          title={s.excerpt}
                        >
                          출처: {label}
                        </Link>
                      ) : s.type === "thread" && s.id ? (
                        <button
                          key={`${s.type}-${s.id}`}
                          type="button"
                          className="min-h-8 underline"
                          title={s.excerpt}
                          onClick={() => {
                            if (s.id) useDock.getState().setThread(s.id);
                            useDock.getState().setOpen(true);
                          }}
                        >
                          출처: 대화 열기
                        </button>
                      ) : (
                        <span key={`${s.type}-${i}`} title={s.excerpt}>
                          출처: {label}
                        </span>
                      );
                    })}
                    <span className="ml-auto flex gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        aria-label={m.pinned ? "고정 해제" : "고정"}
                        onClick={() =>
                          start(() =>
                            updateMemoryAction(m.id, { pinned: !m.pinned }),
                          )
                        }
                      >
                        {m.pinned ? (
                          <PinOff className="size-3.5" />
                        ) : (
                          <Pin className="size-3.5" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        aria-label={archived ? "복구" : "보관"}
                        disabled={archived && Boolean(m.invalidated_at)}
                        onClick={() =>
                          start(() => archiveMemoryAction(m.id, !archived))
                        }
                      >
                        <Archive className="size-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6 text-destructive"
                        aria-label="삭제"
                        onClick={() => {
                          if (confirm("이 기억을 지울까요?"))
                            start(() => forgetMemoryAction(m.id));
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function MemoryReview({ id, content }: { id: string; content: string }) {
  const [original, setOriginal] = useState<Awaited<
    ReturnType<typeof memoryReviewOriginalAction>
  > | null>(null);
  const [busy, setBusy] = useState(false);
  async function decide(choice: "replace" | "keep" | "discard") {
    setBusy(true);
    try {
      await memoryReviewAction(id, choice);
      toast.success("기억을 정리했어요");
    } catch {
      toast.error("기억을 정리하지 못했어요");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-xs font-medium">
        비슷하지만 다른 기억 · 확인 전에는 답변에 사용하지 않아요.
      </p>
      {original ? (
        <>
          <p className="text-xs text-muted-foreground">
            기존: {original.content}
          </p>
          <p className="text-xs">새 내용: {content}</p>
          <div className="flex flex-wrap gap-1">
            <Button size="sm" disabled={busy} onClick={() => decide("replace")}>
              기존 기억 대체
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => decide("keep")}
            >
              둘 다 유지
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => decide("discard")}
            >
              새 내용 보관
            </Button>
          </div>
        </>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await memoryReviewOriginalAction(id);
              if (r) setOriginal(r);
              else
                setOriginal({
                  content: "기존 기억이 삭제되었어요",
                  updatedAt: "",
                });
            } catch {
              toast.error("기존 기억을 불러오지 못했어요");
            } finally {
              setBusy(false);
            }
          }}
        >
          기존 기억과 비교
        </Button>
      )}
    </div>
  );
}
