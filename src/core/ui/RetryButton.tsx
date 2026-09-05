"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
export function RetryButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="ml-2 min-h-9 underline underline-offset-2"
      disabled={pending}
      onClick={() => start(() => router.refresh())}
    >
      {pending ? "불러오는 중…" : "다시 불러오기"}
    </button>
  );
}
