import type { DashboardWidget, DateRange } from "@/core/contracts";
import { cn } from "@/lib/utils";

export interface LoadedWidget {
  // biome-ignore lint/suspicious/noExplicitAny: 위젯 데이터 타입은 위젯마다 다르다
  widget: DashboardWidget<any>;
  data: unknown;
  error: string | null;
}

const SIZE: Record<DashboardWidget["size"], string> = {
  sm: "md:col-span-1",
  md: "md:col-span-2",
  lg: "md:col-span-3",
};

export function WidgetGrid({
  items,
  range,
}: {
  items: LoadedWidget[];
  range: DateRange;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        표시할 위젯이 없어요. 모듈이 등록되면 여기에 나타나요.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {items.map(({ widget, data, error }) => (
        <section
          key={widget.id}
          className={cn("min-w-0", SIZE[widget.size])}
          aria-label={widget.title}
        >
          {error ? (
            <div className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
              {widget.title}: {error}
            </div>
          ) : (
            <widget.Component data={data} range={range} />
          )}
        </section>
      ))}
    </div>
  );
}
