"use client";
import { Mic, Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";
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

/**
 * 우하단 플로팅 버튼. 탭: 레이첼 열기 · 길게 누르기: 음성 캡처(놓으면 전사 → 인박스).
 * 모바일은 하단 탭 위, 데스크톱은 창이 열려 있으면 숨긴다. 녹음 화면에서는 숨긴다.
 */
export function RachelFab() {
  const { open, toggle } = useDock();
  const pathname = usePathname();
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

  if (pathname.startsWith("/meetings/live/")) return null;
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
          : "레이첼 열기 (길게 누르면 음성 캡처, 데스크톱 Shift+Space)"
      }
      aria-pressed={open}
      className={cn(
        "fixed right-4 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] z-40 flex size-12 select-none items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/15 transition-transform active:scale-95 md:bottom-4",
        open && "md:hidden",
        recording && "scale-110 bg-red-500",
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
