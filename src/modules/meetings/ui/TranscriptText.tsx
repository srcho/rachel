"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { editTranscriptAction } from "../actions";
export function TranscriptText({
  meetingId,
  segmentId,
  text,
}: {
  meetingId: string;
  segmentId: string;
  text: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!editing)
    return (
      <span>
        {text}
        <button
          type="button"
          className="ml-2 py-1 text-xs text-muted-foreground underline underline-offset-2"
          onClick={() => {
            setValue(text);
            setEditing(true);
          }}
        >
          정정
        </button>
      </span>
    );
  return (
    <span className="block space-y-1">
      <textarea
        aria-label="발언 정정"
        className="min-h-20 w-full rounded-md border bg-background p-2 text-sm"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <span className="flex gap-1">
        <Button
          size="sm"
          disabled={busy || !value.trim()}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await editTranscriptAction(meetingId, segmentId, value);
              setEditing(false);
            } catch {
              setError("저장하지 못했어요. 다시 시도해 주세요.");
            } finally {
              setBusy(false);
            }
          }}
        >
          저장
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => setEditing(false)}
        >
          취소
        </Button>
      </span>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
