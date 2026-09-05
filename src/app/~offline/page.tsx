"use client";
import { useEffect } from "react";

export default function OfflinePage() {
  useEffect(() => {
    const reconnect = () => window.location.reload();
    window.addEventListener("online", reconnect);
    return () => window.removeEventListener("online", reconnect);
  }, []);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-lg font-semibold">오프라인이에요</h1>
      <p className="text-sm text-muted-foreground">
        연결이 돌아오면 자동으로 이어져요. 캐시된 화면은 뒤로 가기로 볼 수
        있어요.
      </p>
      <button
        type="button"
        className="mt-2 min-h-11 rounded-md border px-4 text-sm"
        onClick={() => window.location.reload()}
      >
        다시 연결
      </button>
    </main>
  );
}
