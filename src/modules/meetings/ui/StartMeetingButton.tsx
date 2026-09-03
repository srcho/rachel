"use client";
import { Mic } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startMeetingAction } from "../actions";

export function StartMeetingButton({
  title,
  calendarEventId,
  size = "sm",
  label = "녹음 시작",
}: {
  title?: string;
  calendarEventId?: string;
  size?: "sm" | "lg" | "default";
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function start() {
    setBusy(true);
    try {
      const mime =
        typeof MediaRecorder !== "undefined"
          ? (["audio/webm;codecs=opus", "audio/mp4"].find((m) =>
              MediaRecorder.isTypeSupported(m),
            ) ?? "")
          : "";
      const m = await startMeetingAction({
        title,
        calendarEventId,
        audioMime: mime || undefined,
      });
      router.push(`/meetings/live/${m.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "시작 실패");
      setBusy(false);
    }
  }
  return (
    <Button size={size} onClick={start} disabled={busy}>
      <Mic className="size-4" /> {busy ? "준비 중…" : label}
    </Button>
  );
}
