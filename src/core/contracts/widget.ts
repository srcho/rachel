import type { ComponentType } from "react";
import type { ServiceContext } from "./context";

export type WidgetSurface = "today" | "insights" | "both";
export interface DateRange {
  from: Date;
  to: Date;
}

export interface DashboardWidget<D = unknown> {
  id: string;
  title: string;
  surface: WidgetSurface;
  /** 너비: sm = 1/4, md = 1/2, lg = 전체 (데스크톱 기준) */
  size: "sm" | "md" | "lg";
  /** 높이(그리드 행 단위, 1행 ≈ 9rem). 기본값: sm 1 · md 2 · lg 2 */
  rows?: 1 | 2 | 3 | 4;
  /**
   * top: 그리드 위에 전체 폭으로, 카드 프레임 없이(입력 바 등).
   * grid(기본): Panel 프레임 안에 렌더 — 위젯은 본문만 그린다.
   */
  placement?: "top" | "grid";
  /** 헤더 우측 "열기" 링크 */
  href?: string;
  order: number;
  /** 서버에서 실행. 결과는 직렬화 가능해야 한다. */
  load(ctx: ServiceContext, range: DateRange): Promise<D>;
  Component: ComponentType<{ data: D; range: DateRange }>;
  /** Panel 헤더 우측에 그릴 위젯 전용 컨트롤(새로고침 등). href 링크 왼쪽에 놓인다 */
  HeaderAction?: ComponentType<{ data: D; range: DateRange }>;
}
