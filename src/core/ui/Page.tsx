import { cn } from "@/lib/utils";

/**
 * 본문 컨테이너 폭 3종으로 잠근다.
 * content: 대시보드(Today·인사이트) — 브라우저 폭을 따라 1440px 까지.
 * narrow: 읽기·목록·설정 — 48rem.
 * full: 보드·캘린더 — 너비를 채운다. 높이는 각 화면의 레이아웃이 결정한다.
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
        // 모바일은 우하단 FAB 이 마지막 컨트롤을 가리지 않게 아래를 더 비운다
        width === "content" && "max-w-[1440px] p-4 pb-24 md:pb-4",
        width === "narrow" && "max-w-3xl p-4 pb-24 md:pb-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
