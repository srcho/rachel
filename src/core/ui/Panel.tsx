import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 모든 위젯·설정 섹션·목록이 쓰는 단일 카드 프레임.
 * 헤더 높이 2.5rem, 본문 패딩 0.75rem, 라운드 lg — 화면마다 제각각이던 카드를 하나로 잠근다.
 * `fill` 이면 부모 높이를 채우고 본문이 안에서 스크롤한다(위젯 그리드).
 */
export function Panel({
  title,
  count,
  action,
  fill,
  bodyClassName,
  className,
  children,
}: {
  title?: ReactNode;
  count?: number | string;
  action?: ReactNode;
  fill?: boolean;
  bodyClassName?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-lg border bg-card text-card-foreground",
        fill && "h-full min-h-0",
        className,
      )}
    >
      {(title || action) && (
        <header className="flex h-10 shrink-0 items-center gap-2 px-3">
          {title && (
            <h2 className="truncate text-[13px] font-medium">{title}</h2>
          )}
          {count !== undefined && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {count}
            </span>
          )}
          {action && (
            <div className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              {action}
            </div>
          )}
        </header>
      )}
      <div
        className={cn(
          "min-h-0 flex-1 px-3 pb-3",
          !title && !action && "pt-3",
          fill && "overflow-y-auto",
          bodyClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** Panel 헤더용 텍스트 링크 */
export function PanelLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className="hover:text-foreground">
      {children}
    </Link>
  );
}
