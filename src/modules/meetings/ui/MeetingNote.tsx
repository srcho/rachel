"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/core/ui/FormDialog";
import { createMeetingNoteAction } from "../actions";
export function MeetingNote() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        메모 남기기
      </Button>
      <FormDialog open={open} onClose={() => setOpen(false)} title="회의 메모">
        {open && <NoteForm />}
      </FormDialog>
    </>
  );
}
function NoteForm() {
  const router = useRouter();
  const [id] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
          const m = await createMeetingNoteAction({ id, title, text });
          router.push(`/meetings/${m.id}`);
        } catch {
          setError("저장하지 못했어요. 입력한 내용을 유지했어요.");
          setBusy(false);
        }
      }}
    >
      <input
        required
        maxLength={200}
        aria-label="회의 제목"
        placeholder="회의 제목"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
      <textarea
        required
        maxLength={10000}
        aria-label="회의 메모"
        placeholder="결정한 내용이나 기억할 일을 적어 주세요."
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="min-h-40 w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
      <p className="text-xs text-muted-foreground">
        녹음 없이 메모만 저장해요.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? "저장 중…" : "저장"}
      </Button>
    </form>
  );
}
