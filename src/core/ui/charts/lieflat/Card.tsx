import type { ReactNode } from "react";

/**
 * lieflat 카드 4종 세트: 결론 제목(h2) · 부제(범례·기간, `·` 구분) · 그림 · 출처행(대문자·자간).
 * Panel 안에서 쓴다(Panel 제목은 비우고 여기 결론을 쓴다).
 */
export function ChartCard({
  title,
  sub,
  source,
  children,
}: {
  title: ReactNode;
  sub?: ReactNode;
  source?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <h3 className="text-[15px] font-bold tracking-[-.02em] text-balance leading-snug">
        {title}
      </h3>
      {sub && (
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">{sub}</p>
      )}
      <div className="mt-2 min-h-0 flex-1">{children}</div>
      {source && (
        <p className="mt-2 text-[9.5px] font-medium tracking-[.08em] text-muted-foreground/70 uppercase">
          {source}
        </p>
      )}
    </div>
  );
}

/** 400×320 뷰박스 SVG. 폭에 맞춰 스케일, 높이 상한으로 카드 안에 머문다 */
export function Frame({
  children,
  maxHeight = 300,
  height = 320,
  label,
}: {
  children: ReactNode;
  maxHeight?: number;
  /** 뷰박스 높이. 데이터가 적으면 내용에 맞춰 줄여 빈 공간을 남기지 않는다 */
  height?: number;
  label: string;
}) {
  return (
    <svg
      viewBox={`0 0 400 ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label}
      className="lf mx-auto block h-auto w-full"
      style={{ maxHeight }}
    >
      {children}
    </svg>
  );
}
