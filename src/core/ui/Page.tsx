import { cn } from "@/lib/utils";

/**
 * 본문 컨테이너 폭 3종으로 잠근다.
 * content: 대시보드(Today·인사이트) — 브라우저 폭을 따라 1440px 까지.
 * narrow: 읽기·목록·설정 — 48rem.
 * full: 보드·캘린더 — 화면을 꽉 채우고 높이도 뷰포트에 맞춘다.
 */
export function Page({
  width = "content",
  className,
  children,
}: {
  width?: "content" | "narrow" | "full";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full",
        width === "content" && "max-w-[1440px] p-4",
        width === "narrow" && "max-w-3xl p-4",
        width === "full" && "md:h-[calc(100dvh-3rem)] md:min-h-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
