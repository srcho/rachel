"use client";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

export interface WeeklyPoint {
  week: string; // YYYY-MM-DD(월요일)
  [series: string]: number | string;
}

/** 주간 막대 차트(시리즈 1~3개). 지연 로드 대상. */
export function WeeklyBars({
  data,
  series,
  height = 160,
}: {
  data: WeeklyPoint[];
  series: Array<{ key: string; label: string; color?: string }>;
  height?: number;
}) {
  const config = Object.fromEntries(
    series.map((s, i) => [
      s.key,
      { label: s.label, color: s.color ?? `var(--chart-${(i % 5) + 1})` },
    ]),
  ) as ChartConfig;
  return (
    <ChartContainer config={config} className="w-full" style={{ height }}>
      <BarChart data={data} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="week"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          tickFormatter={(v: string) =>
            `${Number(v.slice(5, 7))}/${Number(v.slice(8, 10))}`
          }
          fontSize={11}
        />
        <ChartTooltip
          content={<ChartTooltipContent labelFormatter={(v) => `${v} 주`} />}
        />
        {series.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            fill={`var(--color-${s.key})`}
            radius={3}
            maxBarSize={28}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
