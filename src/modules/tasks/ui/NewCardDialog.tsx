"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/core/ui/FormDialog";
import { formatDue, PRIORITY_LABEL } from "../format";
import type { parseDueFromTitle } from "../parse-due";
import type { ColumnRow } from "../repository";

export interface NewCardInput {
  title: string;
  columnId: string;
  dueAt?: string;
  dueHasTime?: boolean;
  priority?: number;
  description?: string;
}

const field =
  "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/50";

/**
 * 카드 추가 다이얼로그. Google Tasks 항목과 같은 최소 정보(제목·마감·설명)에 보드 고유의 상태·우선순위만 더한다.
 * 제목에 "내일 3시" 처럼 쓰면 마감을 제안한다(chrono 는 열릴 때 로드).
 */
export function NewCardDialog({
  open,
  columns,
  defaultColumnId,
  onClose,
  onCreate,
}: {
  open: boolean;
  columns: ColumnRow[];
  defaultColumnId?: string;
  onClose: () => void;
  onCreate: (input: NewCardInput) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [columnId, setColumnId] = useState(defaultColumnId ?? "");
  const [due, setDue] = useState("");
  const [hasTime, setHasTime] = useState(false);
  const [priority, setPriority] = useState(2);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [parse, setParse] = useState<typeof parseDueFromTitle | null>(null);

  // 열리는 순간에만 초기화한다. columns(Realtime 갱신)·parse(chrono 로드) 변화로 작성 중인 폼을 지우지 않는다
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const defaultColumnRef = useRef(defaultColumnId);
  defaultColumnRef.current = defaultColumnId;
  useEffect(() => {
    if (!open) return;
    const cols = columnsRef.current;
    setTitle("");
    setDue("");
    setHasTime(false);
    setPriority(2);
    setDescription("");
    setColumnId(
      defaultColumnRef.current ??
        cols.find((c) => !c.is_done && c.name.toLowerCase() === "todo")?.id ??
        cols.find((c) => !c.is_done)?.id ??
        cols[0]?.id ??
        "",
    );
  }, [open]);
  useEffect(() => {
    if (!open || parse) return;
    void import("../parse-due").then((m) =>
      setParse(() => m.parseDueFromTitle),
    );
  }, [open, parse]);

  const parsed = parse && title.trim() && !due ? parse(title) : null;
  const hint = parsed
    ? formatDue({ due_at: parsed.dueAt, due_has_time: parsed.hasTime })
    : null;

  async function submit() {
    const raw = title.trim();
    if (!raw || busy || !columnId) return;
    setBusy(true);
    try {
      const useParsed = parsed && !due;
      let dueAt: string | undefined;
      if (useParsed) dueAt = parsed.dueAt;
      else if (due)
        dueAt = new Date(hasTime ? due : `${due}T00:00`).toISOString();
      await onCreate({
        title: useParsed ? parsed.title : raw,
        columnId,
        dueAt,
        dueHasTime: useParsed ? parsed.hasTime : hasTime,
        priority,
        description: description.trim(),
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog open={open} onClose={onClose} title="카드 추가">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="space-y-1">
          <input
            // biome-ignore lint/a11y/noAutofocus: 다이얼로그를 열면 바로 제목을 쓴다
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={`${field} text-base font-medium`}
            placeholder="무엇을 할까요? (예: 내일 3시 PRD 검토)"
            aria-label="제목"
          />
          {hint && (
            <p className="px-0.5 text-xs text-muted-foreground">
              마감 제안: <span className="text-foreground">{hint.text}</span> ·
              제목은 “{parsed?.title}”
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">상태</span>
            <select
              className={field}
              value={columnId}
              onChange={(e) => setColumnId(e.target.value)}
              aria-label="상태"
            >
              {columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">우선순위</span>
            <select
              className={field}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            >
              {[0, 1, 2, 3].map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">마감</span>
            <input
              type={hasTime ? "datetime-local" : "date"}
              className={field}
              value={due}
              onChange={(e) => setDue(e.target.value)}
              aria-label="마감"
            />
          </label>
          <label className="flex items-end gap-2 pb-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={hasTime}
              onChange={(e) => {
                setHasTime(e.target.checked);
                setDue((d) =>
                  e.target.checked
                    ? d
                      ? `${d.slice(0, 10)}T09:00`
                      : ""
                    : d.slice(0, 10),
                );
              }}
            />
            시각 지정
          </label>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="text-xs text-muted-foreground">설명</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={field}
            placeholder="선택"
          />
        </label>
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-muted-foreground">
            Enter 로 만들기 · 마감이 있으면 Google Tasks 에도 보여요
          </span>
          <Button type="submit" size="sm" disabled={!title.trim() || busy}>
            {busy ? "만드는 중…" : "만들기"}
          </Button>
        </div>
      </form>
    </FormDialog>
  );
}
