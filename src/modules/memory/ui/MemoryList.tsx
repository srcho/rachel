"use client";
import { Archive, Pin, PinOff, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/core/ui/Panel";
import { cn } from "@/lib/utils";
import {
  archiveMemoryAction,
  forgetMemoryAction,
  rememberAction,
  updateMemoryAction,
} from "../actions";
import { MEMORY_KINDS, type MemoryKind } from "../constants";
import type { MemoryRow } from "../repository";
import type { MemorySource } from "../schema";

export const KIND_LABEL: Record<MemoryKind, string> = {
  fact: "사실",
  preference: "선호",
  person: "사람",
  decision: "결정",
  goal: "목표",
  routine: "루틴",
};

function sourceHref(s: MemorySource): string | null {
  if (s.type === "meeting" && s.id) return `/meetings/${s.id}`;
  if (s.type === "capture") return "/capture";
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
            await rememberAction(c, newKind);
            setNewContent("");
            toast.success("기억했어요");
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
                  key={m.id}
                  className={cn(
                    "space-y-1 px-3 py-2.5 text-sm",
                    pending && "opacity-70",
                  )}
                >
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
                            await updateMemoryAction(m.id, {
                              content: draft.trim(),
                            });
                            setEditing(null);
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
                  <div className="flex items-center gap-2 pl-1 text-[11px] text-muted-foreground">
                    <span title="중요도">{"★".repeat(m.importance)}</span>
                    <span>
                      {new Date(m.updated_at).toLocaleDateString("ko-KR")}
                    </span>
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
