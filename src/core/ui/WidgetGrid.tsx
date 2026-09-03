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
  fill,
}: {
  items: LoadedWidget[];
  range: DateRange;
  /** 데스크톱에서 그리드가 뷰포트 높이를 채우도록 행을 늘린다(Today). 넘치면 스크롤 */
  fill?: boolean;
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
    <div
      className={cn(
        "flex flex-col gap-3",
        fill && "md:min-h-[calc(100dvh-3rem-2rem)]",
      )}
    >
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
          fill
            ? "md:flex-1 md:auto-rows-[minmax(9rem,1fr)]"
            : "md:auto-rows-[9rem]",
        )}
      >
        {grid.map(({ widget, data, error }) => (
          <div
            key={widget.id}
            className={cn(
              "min-h-0 min-w-0",
              COL[widget.size],
              ROW[widget.rows ?? DEFAULT_ROWS[widget.size]],
            )}
          >
            {error ? (
              <ErrorBox title={widget.title} error={error} />
            ) : (
              <Panel
                title={widget.title}
                fill
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
