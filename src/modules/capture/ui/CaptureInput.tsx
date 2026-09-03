"use client";
import { Inbox, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { captureAction } from "../actions";

/** Today 상단 한 줄 캡처 */
export function CaptureInput({ openCount }: { openCount: number }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await captureAction(t, "text");
      setText("");
      toast.success("인박스에 넣었어요. 레이첼이 분류할게요.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "실패");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="flex items-center gap-2 rounded-lg border bg-card p-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="떠오른 것을 던지세요 (할 일·일정·기억으로 분류돼요)"
        className="min-w-0 flex-1 bg-transparent px-1 text-sm outline-none"
        aria-label="빠른 캡처"
      />
      <Button
        type="submit"
        size="icon"
        className="size-8"
        disabled={!text.trim() || busy}
        aria-label="캡처"
      >
        <Send className="size-4" />
      </Button>
      <Button
        asChild
        size="icon"
        variant="ghost"
        className="relative size-8"
        aria-label="인박스"
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
