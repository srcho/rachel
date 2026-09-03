"use client";
import dynamic from "next/dynamic";
import type { WeeklyPoint } from "@/core/ui/charts/WeeklyBars";

const WeeklyBars = dynamic(
  () => import("@/core/ui/charts/WeeklyBars").then((m) => m.WeeklyBars),
  {
    ssr: false,
    loading: () => <div className="h-40 animate-pulse rounded bg-muted/40" />,
  },
);

export function ChartCard({
  title,
  data,
  series,
  footer,
}: {
  title: string;
  data: WeeklyPoint[];
  series: Array<{ key: string; label: string }>;
  footer?: React.ReactNode;
}) {
  const empty = data.every((d) => series.every((s) => !Number(d[s.key])));
  return (
    <div className="rounded-lg border bg-card p-3">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {empty ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          아직 데이터가 없어요.
        </p>
      ) : (
        <WeeklyBars data={data} series={series} />
      )}
      {footer && (
        <div className="mt-2 text-xs text-muted-foreground">{footer}</div>
      )}
    </div>
  );
}
