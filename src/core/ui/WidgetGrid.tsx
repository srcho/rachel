import type { DashboardWidget, DateRange } from "@/core/contracts";
import { cn } from "@/lib/utils";
import { Panel, PanelLink } from "./Panel";

export interface LoadedWidget {
  // biome-ignore lint/suspicious/noExplicitAny: 위젯 데이터 타입은 위젯마다 다르다
  widget: DashboardWidget<any>;
  data: unknown;
  error: string | null;
}

/** 데스크톱 4열 · 태블릿 2열 · 모바일 1열. 행 단위 9rem 으로 높이를 맞춘다. */
const COL: Record<DashboardWidget["size"], string> = {
  sm: "md:col-span-1",
  md: "md:col-span-2",
  lg: "md:col-span-2 xl:col-span-4",
};
const DEFAULT_ROWS: Record<DashboardWidget["size"], number> = {
  sm: 1,
  md: 2,
  lg: 2,
};
const ROW: Record<number, string> = {
  1: "md:row-span-1",
  2: "md:row-span-2",
  3: "md:row-span-3",
  4: "md:row-span-4",
};

export function WidgetGrid({
  items,
  range,
  rowsMode = "fixed",
}: {
  items: LoadedWidget[];
  range: DateRange;
  /**
   * auto: 카드가 내용 높이를 따르고 같은 줄끼리만 높이를 맞춘다(Today — 빈 공간을 만들지 않는다).
   * fixed(기본): 9rem 행 단위로 고정, 본문은 안에서 스크롤(인사이트 — 차트 높이가 필요).
   */
  rowsMode?: "auto" | "fixed";
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        표시할 위젯이 없어요. 모듈이 등록되면 여기에 나타나요.
      </p>
    );
  }
  const top = items.filter((i) => i.widget.placement === "top");
  const grid = items.filter((i) => i.widget.placement !== "top");
  return (
    <div className="flex flex-col gap-3">
      {top.map(({ widget, data, error }) => (
        <section key={widget.id} aria-label={widget.title}>
          {error ? (
            <ErrorBox title={widget.title} error={error} />
          ) : (
            <widget.Component data={data} range={range} />
          )}
        </section>
      ))}
      <div
        className={cn(
          "grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4",
          rowsMode === "fixed" && "md:auto-rows-[9rem]",
        )}
      >
        {grid.map(({ widget, data, error }) => (
          <div
            key={widget.id}
            className={cn(
              "min-h-0 min-w-0",
              COL[widget.size],
              rowsMode === "fixed" &&
                ROW[widget.rows ?? DEFAULT_ROWS[widget.size]],
            )}
          >
            {error ? (
              <ErrorBox title={widget.title} error={error} />
            ) : (
              <Panel
                title={widget.title}
                fill={rowsMode === "fixed"}
                className={rowsMode === "auto" ? "h-full" : undefined}
                action={
                  widget.HeaderAction || widget.href ? (
                    <>
                      {widget.HeaderAction && (
                        <widget.HeaderAction data={data} range={range} />
                      )}
                      {widget.href && (
                        <PanelLink href={widget.href}>열기</PanelLink>
                      )}
                    </>
                  ) : undefined
                }
              >
                <widget.Component data={data} range={range} />
              </Panel>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorBox({ title, error }: { title: string; error: string }) {
  return (
    <div className="h-full rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
      {title}: {error}
    </div>
  );
}
