"use client";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] 화면 조회 실패", error.digest, error);
  }, [error]);
  return (
    <div className="mx-auto max-w-md space-y-3 px-4 py-12">
      <h1 className="text-base font-medium">내용을 불러오지 못했어요</h1>
      <p className="text-sm text-muted-foreground">
        연결 상태를 확인하고 다시 시도해 주세요. 저장된 내용은 유지돼요.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>다시 시도</Button>
        <Button asChild variant="ghost">
          <Link href="/today">오늘로 이동</Link>
        </Button>
      </div>
    </div>
  );
}
