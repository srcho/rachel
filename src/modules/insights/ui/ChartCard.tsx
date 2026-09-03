"use client";
import dynamic from "next/dynamic";
import type { WeeklyPoint } from "@/core/ui/charts/WeeklyBars";

const WeeklyBars = dynamic(
  () => import("@/core/ui/charts/WeeklyBars").then((m) => m.WeeklyBars),
  {
    ssr: false,
    loading: () => <div className="h-36 animate-pulse rounded bg-muted/40" />,
  },
);

/** Panel 안의 주간 막대 차트 + 한 줄 요약. 프레임은 부모가 그린다. */
export function ChartCard({
  data,
  series,
  footer,
}: {
  data: WeeklyPoint[];
  series: Array<{ key: string; label: string }>;
  footer?: React.ReactNode;
}) {
  const empty = data.every((d) => series.every((s) => !Number(d[s.key])));
  return (
    <div className="flex h-full flex-col">
      {empty ? (
        <p className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          아직 데이터가 없어요.
        </p>
      ) : (
        <WeeklyBars data={data} series={series} />
      )}
      {footer && <p className="mt-2 text-xs text-muted-foreground">{footer}</p>}
    </div>
  );
}
