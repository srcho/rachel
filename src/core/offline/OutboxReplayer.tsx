"use client";
import { CloudOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { onOutboxChange, replayOutbox, setOutboxUser } from "./outbox";

/** 앱 레이아웃에 마운트: 온라인 복귀·시작 시 아웃박스 재생, 대기 건수 배지 */
export function OutboxReplayer({ userId }: { userId: string }) {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOutboxUser(userId);
    setOnline(navigator.onLine);
    const off = onOutboxChange(setCount);
    const replay = async () => {
      const r = await replayOutbox();
      if (r.done > 0) {
        toast.success(`오프라인 변경 ${r.done}건을 반영했어요`);
        router.refresh();
      }
      if (r.failed > 0)
        toast.error(`${r.failed}건을 전송하지 못해 기기에 보관하고 있어요`);
    };
    const onOnline = () => {
      setOnline(true);
      void replay();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    void replay();
    return () => {
      off();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [router, userId]);
  if (online && count === 0) return null;
  return (
    <div className="fixed top-2 left-1/2 z-50 -translate-x-1/2 rounded-full border bg-background/95 px-3 py-1 text-xs shadow backdrop-blur">
      <span className="inline-flex items-center gap-1.5">
        <CloudOff className="size-3.5 text-muted-foreground" />
        {online
          ? `동기화 대기 ${count}건`
          : `오프라인${count ? ` · 대기 ${count}건` : ""}`}
      </span>
      {online && count > 0 && (
        <button
          type="button"
          className="ml-2 min-h-9 underline"
          onClick={async () => {
            const r = await replayOutbox();
            if (r.failed)
              toast.error("전송하지 못했어요. 입력은 기기에 남아 있어요.");
            if (r.done) router.refresh();
          }}
        >
          다시 전송
        </button>
      )}
    </div>
  );
}
