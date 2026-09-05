"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/core/ui/FormDialog";
import { resolveCaptureAction } from "../actions";
import { type Triage, triageSchema } from "../schema";
import type { CaptureRow } from "../service";

const field = "min-h-10 w-full rounded-md border bg-background px-2 text-sm";
const local = (iso?: string | null) => {
  if (!iso || !Number.isFinite(Date.parse(iso))) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};
export function CaptureReview({
  capture,
  onDone,
}: {
  capture: CaptureRow;
  onDone: () => void;
}) {
  const original = capture.triage as Triage | null;
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<Triage["type"]>(original?.type ?? "task");
  const [title, setTitle] = useState(
    original?.task?.title ??
      original?.event?.title ??
      original?.memory?.content ??
      capture.raw_text,
  );
  const [date, setDate] = useState(
    local(original?.event?.startAt ?? original?.task?.due),
  );
  const [end, setEnd] = useState(local(original?.event?.endAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const override: Triage = { type, reason: "직접 확인한 내용" };
      if (type === "task")
        override.task = {
          title: title.trim(),
          due: date
            ? date === local(original?.task?.due)
              ? original?.task?.due
              : new Date(date).toISOString()
            : null,
          dueHasTime:
            !!date &&
            (date === local(original?.task?.due)
              ? (original?.task?.dueHasTime ??
                Boolean(
                  original?.task?.due && !original.task.due.includes("T23:59"),
                ))
              : true),
          priority: original?.task?.priority ?? 2,
        };
      if (type === "event") {
        const startAt =
          date === local(original?.event?.startAt) && original?.event?.startAt
            ? original.event.startAt
            : new Date(date).toISOString();
        override.event = {
          title: title.trim(),
          startAt,
          endAt: end
            ? end === local(original?.event?.endAt)
              ? (original?.event?.endAt ?? new Date(end).toISOString())
              : new Date(end).toISOString()
            : new Date(Date.parse(startAt) + 3600000).toISOString(),
          allDay: original?.event?.allDay ?? false,
          location: original?.event?.location,
        };
      }
      if (type === "memory")
        override.memory = {
          kind: original?.memory?.kind ?? "fact",
          content: title.trim(),
        };
      await resolveCaptureAction(capture.id, override);
      setOpen(false);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "확정하지 못했어요");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={
          capture.status === "resolving" &&
          triageSchema.safeParse(capture.triage).success
        }
        onClick={() => {
          setType(original?.type ?? "task");
          setTitle(
            original?.task?.title ??
              original?.event?.title ??
              original?.memory?.content ??
              capture.raw_text,
          );
          setDate(local(original?.event?.startAt ?? original?.task?.due));
          setEnd(local(original?.event?.endAt));
          setError("");
          setOpen(true);
        }}
      >
        수정 후 확정
      </Button>
      <FormDialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="빠른 메모 정리"
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <select
            className={field}
            aria-label="정리할 유형"
            value={type}
            onChange={(e) => setType(e.target.value as Triage["type"])}
          >
            <option value="task">할 일</option>
            <option value="event">일정</option>
            <option value="memory">기억</option>
            <option value="note">메모로 보관</option>
          </select>
          {type === "note" ? (
            <p className="whitespace-pre-wrap text-sm">{capture.raw_text}</p>
          ) : (
            <textarea
              className={`${field} py-2`}
              rows={3}
              aria-label={type === "memory" ? "기억할 내용" : "제목"}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={type === "memory" ? 300 : 200}
              required
            />
          )}
          {(type === "task" || type === "event") && (
            <label className="block space-y-1 text-xs text-muted-foreground">
              {type === "task" ? "마감 · 비워두면 미정" : "시작"}
              <input
                type="datetime-local"
                className={field}
                value={date}
                required={type === "event"}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          )}
          {type === "event" && (
            <label className="block space-y-1 text-xs text-muted-foreground">
              종료 · 비워두면 1시간
              <input
                type="datetime-local"
                className={field}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          )}
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "저장 중…" : "이 내용으로 확정"}
          </Button>
        </form>
      </FormDialog>
    </>
  );
}
