"use client";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDue } from "../format";
import { parseDueFromTitle } from "../parse-due";

export function QuickAdd({
  onAdd,
  autoFocus,
}: {
  onAdd: (input: {
    title: string;
    dueAt?: string;
    dueHasTime?: boolean;
  }) => Promise<void>;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(autoFocus));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  const parsed = text.trim() ? parseDueFromTitle(text) : null;
  const preview = parsed
    ? formatDue({ due_at: parsed.dueAt, due_has_time: parsed.hasTime })
    : null;

  async function submit() {
    const raw = text.trim();
    if (!raw || busy) return;
    setBusy(true);
    try {
      await onAdd(
        parsed
          ? {
              title: parsed.title,
              dueAt: parsed.dueAt,
              dueHasTime: parsed.hasTime,
            }
          : { title: raw },
      );
      setText("");
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" /> 카드 추가
      </Button>
    );
  }
  return (
    <form
      className="space-y-1"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (!text.trim()) setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setText("");
            setOpen(false);
          }
        }}
        placeholder="할 일 (예: 내일 3시 PRD 검토)"
        className="w-full rounded-md border bg-background px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50"
        aria-label="새 카드 제목"
      />
      {parsed && preview && (
        <p className="px-1 text-[11px] text-muted-foreground">
          마감{" "}
          <span className="font-medium text-foreground">{preview.text}</span> ·
          제목 “{parsed.title}”
        </p>
      )}
    </form>
  );
}
