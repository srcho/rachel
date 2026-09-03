"use client";
import { Mic, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { captureAction } from "@/modules/capture/actions";
import {
  transcribeClip,
  useVoiceClip,
} from "@/modules/capture/ui/useVoiceClip";
import { useDock } from "./store";

const HOLD_MS = 400;

/** 탭: 레이첼 열기 · 길게 누르기: 음성 캡처(놓으면 전사 → 인박스) */
export function RachelFab() {
  const { open, toggle } = useDock();
  const { recording, start, stop } = useVoiceClip();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const [busy, setBusy] = useState(false);

  function down() {
    held.current = false;
    timer.current = setTimeout(async () => {
      held.current = true;
      try {
        await start();
        if (navigator.vibrate) navigator.vibrate(30);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "마이크를 쓸 수 없어요");
      }
    }, HOLD_MS);
  }
  async function up() {
    if (timer.current) clearTimeout(timer.current);
    if (!held.current) {
      toggle();
      return;
    }
    setBusy(true);
    try {
      const wav = await stop();
      if (!wav) return;
      const text = await transcribeClip(wav);
      if (!text.trim()) return toast.message("들리는 말이 없었어요");
      await captureAction(text, "voice");
      toast.success(`인박스에 넣었어요: “${text.slice(0, 40)}”`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "캡처 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={() => {
        if (timer.current) clearTimeout(timer.current);
        if (held.current) void stop();
      }}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={
        recording
          ? "녹음 중 — 놓으면 캡처"
          : "레이첼 열기 (길게 누르면 음성 캡처)"
      }
      aria-pressed={open}
      className={cn(
        "-mt-5 flex size-12 select-none items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition-transform active:scale-95",
        open && "bg-primary/80",
        recording && "scale-110 bg-red-500 ring-red-500/30",
        busy && "opacity-70",
      )}
      style={{ touchAction: "none" }}
    >
      {recording ? (
        <Mic className="size-5 animate-pulse" />
      ) : (
        <Sparkles className="size-5" />
      )}
    </button>
  );
}
