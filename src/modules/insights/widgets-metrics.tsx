import { Badge } from "@/components/ui/badge";
import type { DashboardWidget } from "@/core/contracts";
import { ChartCard } from "@/core/ui/charts/lieflat/Card";
import {
  DotHeat,
  HairlineLine,
  PairedRungs,
  StackedRungs,
  TickGauge,
  TickRows,
} from "@/core/ui/charts/lieflat/charts";
import {
  calendarWeekly,
  captureWeekly,
  meetingsWeekly,
  overdueStats,
  slotHeat,
  streak,
  tasksWeekly,
} from "./metrics";
import { detectPatterns } from "./patterns";

/*
 * 인사이트 위젯. 그림은 lieflat Basics 갤러리를 옮긴 것(core/ui/charts/lieflat), 선택 기준은 데이터 형태:
 *  - 주별 2계열(생성·완료)      → F6 Paired Rungs
 *  - 주별 단일 시계열(소요 시간) → F2 Hairline Line
 *  - 요일×시간×양               → F10 Dot Heat
 *  - 주별 구성(회의 vs 나머지)   → F7 Stacked Rungs
 *  - 단일 비율(캡처 전환)        → F11 Tick Gauge
 *  - 항목별 셀 수 있는 양(지연) → F5 Tick Rows
 * 제목은 그림에서 읽히는 결론 한 문장. 비용은 설정 화면에서.
 */

const DOW = ["월", "화", "수", "목", "금", "토", "일"];
const wk = (ymd: string) =>
  `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;
const rangeLabel = (weeks: number) =>
  weeks <= 4 ? "최근 4주" : weeks <= 13 ? "최근 3개월" : "최근 6개월";

/* ── 1. 할 일 흐름: 만든 것 vs 끝낸 것 ── */
export const throughputWidget: DashboardWidget<{
  weekly: Array<{ week: string; created: number; completed: number }>;
  streak: number;
}> = {
  id: "insights.tasks",
  title: "할 일 흐름",
  surface: "insights",
  size: "md",
  rows: 3,
  order: 10,
  load: async (ctx, range) => ({
    weekly: (await tasksWeekly(ctx, range)).weekly,
    streak: (await streak(ctx)).current,
  }),
  Component: ({ data }) => {
    const w = data.weekly;
    const created = w.reduce((n, d) => n + d.created, 0);
    const completed = w.reduce((n, d) => n + d.completed, 0);
    const last = w.at(-1);
    const net = completed - created;
    const title =
      created === 0 && completed === 0
        ? "아직 카드 흐름이 없어요"
        : net >= 0
          ? `만든 것보다 ${net}장 더 끝냈어요`
          : `끝낸 것보다 ${-net}장 더 쌓였어요`;
    const sub = `${rangeLabel(w.length)} · 생성 ${created} · 완료 ${completed}${
      last ? ` · 이번 주 ${last.completed}/${last.created}` : ""
    }${data.streak > 1 ? ` · ${data.streak}일 연속 완료` : ""}`;
    return (
      <ChartCard
        title={title}
        sub={sub}
        source="one rung = one card · faint = created · ink = completed"
      >
        <PairedRungs
          label="주별 생성·완료 카드"
          unitName="장"
          data={w.map((d) => ({
            name: wk(d.week),
            was: d.created,
            now: d.completed,
          }))}
        />
      </ChartCard>
    );
  },
};

/* ── 2. 완료까지 걸린 시간(주별 중앙값) ── */
export const cycleWidget: DashboardWidget<
  Array<{ week: string; medianHours: number; completed: number }>
> = {
  id: "insights.cycle",
  title: "완료 소요 시간",
  surface: "insights",
  size: "md",
  rows: 3,
  order: 20,
  load: async (ctx, range) => {
    const { weekly, cycle } = await tasksWeekly(ctx, range);
    return weekly.map((d) => {
      const c = cycle.find((x) => x.week === d.week);
      return {
        week: d.week,
        medianHours: c?.medianHours ?? 0,
        completed: c?.completed ?? 0,
      };
    });
  },
  Component: ({ data }) => {
    const withData = data.filter((d) => d.completed > 0);
    const last = withData.at(-1);
    const avg = withData.length
      ? withData.reduce((n, d) => n + d.medianHours, 0) / withData.length
      : 0;
    const fmt = (h: number) =>
      h < 48 ? `${Math.round(h)}시간` : `${(h / 24).toFixed(1)}일`;
    const title = !last
      ? "완료한 카드가 아직 없어요"
      : last.medianHours <= avg
        ? `요즘은 카드를 ${fmt(last.medianHours)} 만에 끝내요 — 평소보다 빨라요`
        : `요즘은 카드를 ${fmt(last.medianHours)} 만에 끝내요 — 평소(${fmt(avg)})보다 느려요`;
    return (
      <ChartCard
        title={title}
        sub={`${rangeLabel(data.length)} · 만든 뒤 완료까지 걸린 시간의 주별 중앙값 · 큰 점 = 가장 오래 걸린 두 주`}
        source="one dot = one week · hollow = no completions that week"
      >
        <HairlineLine
          label="주별 완료 소요 시간 중앙값"
          format={fmt}
          data={data.map((d) => ({
            name: wk(d.week),
            // 완료가 없던 주는 바닥의 빈 점으로
            value: d.completed > 0 ? Math.round(d.medianHours * 10) / 10 : 0,
            hollow: d.completed === 0,
          }))}
        />
      </ChartCard>
    );
  },
};

/* ── 3. 일정이 몰리는 시간대 ── */
export const slotWidget: DashboardWidget<{ grid: number[][]; weeks: number }> =
  {
    id: "insights.slots",
    title: "일정이 몰리는 시간",
    surface: "insights",
    size: "md",
    rows: 3,
    order: 30,
    load: async (ctx, range) => ({
      grid: await slotHeat(ctx, range),
      weeks: (await calendarWeekly(ctx, range)).length,
    }),
    Component: ({ data }) => {
      const hours = Array.from({ length: 16 }, (_, i) => 7 + i); // 07~22
      let best = { dow: 0, hour: 9, v: 0 };
      let total = 0;
      const byDow = new Array(7).fill(0) as number[];
      data.grid.forEach((row, dow) => {
        row.forEach((v, hour) => {
          total += v;
          byDow[dow] = (byDow[dow] ?? 0) + v;
          if (v > best.v) best = { dow, hour, v };
        });
      });
      // 평일 중 오전(7~12시)이 가장 비는 요일
      const morning = byDow
        .slice(0, 5)
        .map((_, d) =>
          hours
            .filter((h) => h < 12)
            .reduce((n, h) => n + (data.grid[d]?.[h] ?? 0), 0),
        );
      const freeDow = morning.indexOf(Math.min(...morning));
      const title =
        total === 0
          ? "이 기간엔 일정이 없어요"
          : `${DOW[best.dow]}요일 ${best.hour}시대에 가장 몰려요`;
      const sub =
        total === 0
          ? rangeLabel(data.weeks)
          : `${rangeLabel(data.weeks)} · 그 칸이 전체의 ${Math.round((best.v / total) * 100)}% · ${DOW[freeDow]}요일 오전이 가장 비어 있어요`;
      return (
        <ChartCard
          title={title}
          sub={sub}
          source="dot area = hours · dashed ring = the peak"
        >
          <DotHeat
            grid={data.grid}
            hours={hours}
            label="요일·시간대별 일정 시간"
            unitName="시간"
          />
        </ChartCard>
      );
    },
  };

/* ── 4. 일정 중 회의의 비중 ── */
export const meetingShareWidget: DashboardWidget<
  Array<{ week: string; meetingHours: number; otherHours: number }>
> = {
  id: "insights.meetings",
  title: "회의가 차지하는 시간",
  surface: "insights",
  size: "md",
  rows: 3,
  order: 40,
  load: async (ctx, range) => {
    const [m, c] = await Promise.all([
      meetingsWeekly(ctx, range),
      calendarWeekly(ctx, range),
    ]);
    return c.map((d, i) => {
      const meetingHours = (m[i]?.minutes ?? 0) / 60;
      return {
        week: d.week,
        meetingHours: Math.round(meetingHours * 10) / 10,
        otherHours: Math.max(0, Math.round((d.hours - meetingHours) * 10) / 10),
      };
    });
  },
  Component: ({ data }) => {
    const meet = data.reduce((n, d) => n + d.meetingHours, 0);
    const all = data.reduce((n, d) => n + d.meetingHours + d.otherHours, 0);
    const share = all > 0 ? Math.round((meet / all) * 100) : 0;
    const perWeek = data.length ? meet / data.length : 0;
    const title =
      all === 0
        ? "기록된 일정·회의가 없어요"
        : share >= 50
          ? `일정의 ${share}%가 회의예요 — 절반이 넘어요`
          : `일정의 ${share}%가 회의예요`;
    return (
      <ChartCard
        title={title}
        sub={`${rangeLabel(data.length)} · 회의 ${Math.round(meet)}시간 · 주당 평균 ${perWeek.toFixed(1)}시간 · 진함 = 회의(녹음), 옅음 = 그 외 일정`}
        source="one rung = one hour · ink = recorded meetings"
      >
        <StackedRungs
          label="주별 회의·기타 일정 시간"
          unitName="시간"
          segments={["회의", "그 외 일정"]}
          data={data.map((d) => ({
            name: wk(d.week),
            values: [d.meetingHours, d.otherHours],
          }))}
        />
      </ChartCard>
    );
  },
};

/* ── 5. 캡처 → 정리 전환 ── */
export const captureConversionWidget: DashboardWidget<{
  captured: number;
  resolved: number;
  dismissed: number;
  weeks: number;
}> = {
  id: "insights.capture",
  title: "캡처가 정리되는 비율",
  surface: "insights",
  size: "md",
  rows: 3,
  order: 50,
  load: async (ctx, range) => {
    const w = await captureWeekly(ctx, range);
    return {
      captured: w.reduce((n, d) => n + d.captured, 0),
      resolved: w.reduce((n, d) => n + d.resolved, 0),
      dismissed: w.reduce((n, d) => n + (d.dismissed ?? 0), 0),
      weeks: w.length,
    };
  },
  Component: ({ data }) => {
    const pct = data.captured
      ? Math.round((data.resolved / data.captured) * 100)
      : 0;
    const open = Math.max(0, data.captured - data.resolved - data.dismissed);
    const title =
      data.captured === 0
        ? "캡처가 아직 없어요"
        : pct >= 80
          ? "던진 건 거의 다 정리돼요"
          : open > 0
            ? `${open}건이 인박스에 남아 있어요`
            : `캡처의 ${pct}%가 정리됐어요`;
    return (
      <ChartCard
        title={title}
        sub={`${rangeLabel(data.weeks)} · 캡처 ${data.captured} · 정리 ${data.resolved} · 버림 ${data.dismissed}`}
        source="one tick = 1% · inked = resolved"
      >
        <TickGauge
          percent={pct}
          label="캡처 정리 비율"
          center={`${pct}%`}
          caption={
            data.captured
              ? `${data.resolved} OF ${data.captured} RESOLVED`
              : "NO CAPTURES"
          }
          note="ONE TICK = 1% · INKED = RESOLVED"
        />
      </ChartCard>
    );
  },
};

/* ── 6. 지연 카드가 어디에 몰려 있나 ── */
export const overdueWidget: DashboardWidget<{
  total: number;
  byLabel: Array<[string, number]>;
  byPriority: number[];
}> = {
  id: "insights.overdue",
  title: "지연된 카드",
  surface: "insights",
  size: "md",
  rows: 3,
  order: 60,
  load: async (ctx) => overdueStats(ctx),
  Component: ({ data }) => {
    const rows =
      data.byLabel.length > 0
        ? data.byLabel.map(([name, value]) => ({ name, value }))
        : data.byPriority
            .map((v, p) => ({ name: `P${p}`, value: v }))
            .filter((r) => r.value > 0);
    const top = data.byLabel[0];
    const title =
      data.total === 0
        ? "지연된 카드가 없어요"
        : top
          ? `지연 ${data.total}장, '${top[0]}'에 ${top[1]}장이 몰려 있어요`
          : `지연된 카드가 ${data.total}장이에요`;
    const urgent = (data.byPriority[0] ?? 0) + (data.byPriority[1] ?? 0);
    return (
      <ChartCard
        title={title}
        sub={`지금 기준 · 마감이 지났는데 안 끝난 카드${urgent ? ` · 그중 P0·P1 ${urgent}장` : ""}`}
        source="one tick = one overdue card · rows = labels"
      >
        {rows.length === 0 ? (
          <p className="flex h-full min-h-24 items-center text-sm text-muted-foreground">
            마감 지난 카드가 없어요. 잘 하고 있어요.
          </p>
        ) : (
          <TickRows data={rows} label="라벨별 지연 카드" unitName="장" />
        )}
      </ChartCard>
    );
  },
};

/* ── 0. 레이첼의 관찰(규칙 기반 문장) ── */
export const patternsWidget: DashboardWidget<
  Awaited<ReturnType<typeof detectPatterns>>["patterns"]
> = {
  id: "insights.patterns",
  title: "레이첼의 관찰",
  surface: "insights",
  size: "lg",
  rows: 1,
  order: 5,
  load: async (ctx, range) => (await detectPatterns(ctx, range)).patterns,
  Component: ({ data }) =>
    data.length === 0 ? (
      <p className="flex h-full min-h-10 items-center text-sm text-muted-foreground">
        아직 눈에 띄는 패턴이 없어요. 몇 주 쌓이면 여기에 나타나요.
      </p>
    ) : (
      <ul className="flex flex-wrap gap-1.5">
        {data.map((p) => (
          <li key={p.id}>
            <Badge
              variant={p.severity === "warn" ? "destructive" : "secondary"}
              className="h-6 px-2.5"
            >
              {p.text}
            </Badge>
          </li>
        ))}
      </ul>
    ),
};
