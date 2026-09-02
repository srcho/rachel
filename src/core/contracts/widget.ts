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
  size: "sm" | "md" | "lg";
  order: number;
  /** 서버에서 실행. 결과는 직렬화 가능해야 한다. */
  load(ctx: ServiceContext, range: DateRange): Promise<D>;
  Component: ComponentType<{ data: D; range: DateRange }>;
}
