"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { captureUrl } from "../url";
import { saveCapture } from "./CaptureOutbox";

export function CaptureComposer({
  userId,
  initialText = "",
  shared = false,
  onSaved,
}: {
  userId: string;
  initialText?: string;
  shared?: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ id?: string; queued: boolean } | null>(
    null,
  );
  const input = useRef<HTMLTextAreaElement>(null);
  const submitting = useRef(false);
  const key = useRef(crypto.randomUUID());
  const draftKey = `rachel-capture:${userId}`;
  useEffect(() => {
    if (shared) return;
    setText(initialText);
    key.current = crypto.randomUUID();
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey) ?? "null");
      if (typeof draft?.text === "string") setText(draft.text);
      if (typeof draft?.id === "string") key.current = draft.id;
    } catch {
      // Saving to the server remains available when local storage is disabled.
    }
  }, [draftKey, shared, initialText]);

  function change(value: string) {
    key.current = crypto.randomUUID();
    setText(value);
    setSaved(null);
    setError("");
    if (!shared) {
      try {
        localStorage.setItem(
          draftKey,
          JSON.stringify({ text: value, id: key.current }),
        );
      } catch {
        setError(
          "이 브라우저에서는 임시 보관을 할 수 없어요. 닫기 전에 저장해 주세요.",
        );
      }
    }
  }
  async function save() {
    const value = text.trim();
    if (!value || value.length > 4000 || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await saveCapture(
        value,
        shared ? "share" : "text",
        undefined,
        key.current,
      );
      if (!shared) {
        try {
          localStorage.removeItem(draftKey);
        } catch {
          /* Storage is optional. */
        }
      }
      key.current = crypto.randomUUID();
      setText("");
      setSaved({ id: result.result?.id, queued: result.queued });
      toast.success(
        result.queued
          ? "기기에 보관했어요. 연결되면 수집함으로 전송해요."
          : "수집함에 저장했어요",
        {
          action: result.result
            ? {
                label: "메모 보기",
                onClick: () => router.push(`/capture/${result.result?.id}`),
              }
            : undefined,
        },
      );
      if (!result.queued) {
        if (shared) router.replace("/capture");
        else router.refresh();
      } else if (shared) {
        // Clear shared parameters without requesting an offline server page.
        window.history.replaceState(null, "", "/capture");
      }
      onSaved?.();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "저장하지 못했어요. 내용을 유지했으니 다시 저장해 주세요.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="block space-y-2 text-sm font-medium">
        <span>
          {shared ? "공유받은 내용" : "메모나 링크를 바로 저장하세요"}
        </span>
        <textarea
          ref={input}
          aria-label="빠른 메모 내용"
          value={text}
          disabled={busy}
          rows={3}
          onChange={(e) => change(e.target.value)}
          onKeyDown={(e) => {
            if (
              (e.metaKey || e.ctrlKey) &&
              e.key === "Enter" &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void save();
            }
          }}
          placeholder="생각난 내용, 나중에 볼 링크를 붙여넣으세요"
          className="block max-h-[30dvh] min-h-24 w-full resize-y rounded-lg border bg-background p-3 text-base font-normal outline-none focus:ring-2 focus:ring-ring/50"
        />
      </label>
      {captureUrl(text) && (
        <p className="truncate text-xs text-muted-foreground">
          링크도 함께 저장해요 · {captureUrl(text)}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            try {
              const pasted = await navigator.clipboard.readText();
              if (pasted.length + text.length + (text ? 1 : 0) > 4000) {
                setError(
                  "한 메모는 4,000자까지 저장할 수 있어요. 필요한 부분만 붙여넣어 주세요.",
                );
                return;
              }
              change(text ? `${text}\n${pasted}` : pasted);
              input.current?.focus();
            } catch {
              input.current?.focus();
              setError("입력창을 길게 누르거나 ⌘V / Ctrl+V로 붙여넣어 주세요.");
            }
          }}
        >
          붙여넣기
        </Button>
        <Button
          type="submit"
          disabled={busy || !text.trim() || text.length > 4000}
        >
          {busy ? "저장 중…" : "수집함에 저장"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        먼저 원문을 보관하고, 할 일·일정·기억으로 옮길지는 나중에 결정해요.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {text.length > 4000 && (
        <p role="alert" className="text-sm text-destructive">
          한 메모는 4,000자까지 저장할 수 있어요. 내용을 나눠 저장해 주세요. (
          {text.length.toLocaleString()}자)
        </p>
      )}
      {saved && (
        <output className="block text-sm">
          {saved.queued ? (
            "기기에 보관됨 · 인터넷에 연결되면 전송해요."
          ) : (
            <Link className="underline" href={`/capture/${saved.id}`}>
              저장한 메모 보기
            </Link>
          )}
        </output>
      )}
    </form>
  );
}
