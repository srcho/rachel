"use client";
import { ArrowUp, Square } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";

export function Composer({
  onSend,
  onStop,
  busy,
  autoFocus,
  text,
  onTextChange,
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  busy: boolean;
  autoFocus?: boolean;
  text: string;
  onTextChange: (text: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  function submit() {
    const t = text.trim();
    if (!t || busy) return;
    onSend(t);
    onTextChange("");
    ref.current?.focus();
  }
  return (
    <form
      className="flex items-end gap-2 border-t bg-background p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={ref}
        // biome-ignore lint/a11y/noAutofocus: Dock 을 열면 바로 입력한다
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        placeholder="레이첼에게 말하기"
        aria-label="메시지"
        className="max-h-32 min-h-9 flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/50"
      />
      {busy ? (
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={onStop}
          aria-label="중지"
        >
          <Square className="size-4" />
        </Button>
      ) : (
        <Button
          type="submit"
          size="icon"
          disabled={!text.trim()}
          aria-label="보내기"
        >
          <ArrowUp className="size-4" />
        </Button>
      )}
    </form>
  );
}
