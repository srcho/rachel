"use client";
import { Inbox } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { quickTaskAction } from "../actions";
import { saveCapture } from "./CaptureOutbox";

/** Today 상단 한 줄 캡처 */
export function CaptureInput({ openCount }: { openCount: number }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const key = useRef(crypto.randomUUID());
  async function submit(asTask = true) {
    const t = text.trim();
    if (!t || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      let queued = false;
      if (asTask) await quickTaskAction(t, key.current);
      else
        queued = (await saveCapture(t, "text", undefined, key.current)).queued;
      key.current = crypto.randomUUID();
      setText("");
      toast.success(
        asTask
          ? "할 일로 추가했어요"
          : queued
            ? "기기에 보관했어요. 연결되면 수집함으로 전송해요."
            : "수집함에 메모를 남겼어요",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "실패");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-card p-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input
        disabled={busy}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="할 일이나 기억할 내용을 입력하세요"
        className="min-h-10 min-w-0 basis-full bg-transparent px-1 text-sm outline-none sm:basis-0 sm:flex-1"
        aria-label="빠른 입력"
      />
      <Button
        type="submit"
        size="sm"
        className="min-h-10"
        disabled={!text.trim() || busy}
        aria-label="할 일로 추가"
      >
        할 일로 추가
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="min-h-10"
        disabled={!text.trim() || busy}
        onClick={() => void submit(false)}
      >
        메모로 남기기
      </Button>
      <Button
        asChild
        size="icon"
        variant="ghost"
        className="relative size-8"
        aria-label="수집함"
      >
        <Link href="/capture">
          <Inbox className="size-4" />
          {openCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground">
              {openCount}
            </span>
          )}
        </Link>
      </Button>
    </form>
  );
}
