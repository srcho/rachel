import { Badge } from "@/components/ui/badge";
import type { DashboardWidget } from "@/core/contracts";
import { formatCost, formatTokens } from "@/modules/agent/dock/CostChip";
import {
  calendarWeekly,
  captureWeekly,
  meetingsWeekly,
  overdueStats,
  streak,
  tasksWeekly,
} from "./metrics";
import { detectPatterns } from "./patterns";
import { ChartCard } from "./ui/ChartCard";
import { StatTile } from "./ui/StatTile";

export const throughputWidget: DashboardWidget<
  Awaited<ReturnType<typeof tasksWeekly>> & { overdue: number; streak: number }
> = {
  id: "insights.tasks",
  title: "할 일 처리량",
  surface: "insights",
  size: "md",
  rows: 3,
  order: 10,
  load: async (ctx, range) => ({
    ...(await tasksWeekly(ctx, range)),
    overdue: (await overdueStats(ctx)).total,
    streak: (await streak(ctx)).current,
  }),
  Component: ({ data }) => {
    const c = data.cycle.at(-1);
    return (
      <div className="flex h-full flex-col gap-3">
        <div className="grid grid-cols-3 gap-3 border-b pb-3">
          <StatTile
            label="이번 주 완료"
            value={data.weekly.at(-1)?.completed ?? 0}
            sub={`생성 ${data.weekly.at(-1)?.created ?? 0}`}
          />
          <StatTile
            label="지연"
            value={data.overdue}
            tone={data.overdue >= 5 ? "warn" : undefined}
          />
          <StatTile
            label="완료 스트릭"
            value={`${data.streak}일`}
            tone={data.streak >= 3 ? "good" : undefined}
          />
        </div>
        <ChartCard
          data={data.weekly}
          series={[
            { key: "created", label: "생성" },
            { key: "completed", label: "완료" },
          ]}
          footer={
            c
              ? `완료까지 중앙값 ${c.medianHours < 48 ? `${Math.round(c.medianHours)}시간` : `${Math.round(c.medianHours / 24)}일`}`
              : undefined
          }
        />
      </div>
    );
  },
};

export const meetingsHoursWidget: DashboardWidget<
  Awaited<ReturnType<typeof meetingsWeekly>>
> = {
  id: "insights.meetings",
  title: "주간 회의 시간(분)",
  surface: "insights",
  size: "md",
  order: 20,
  load: (ctx, range) => meetingsWeekly(ctx, range),
  Component: ({ data }) => (
    <ChartCard
      data={data}
      series={[{ key: "minutes", label: "분" }]}
      footer={`총 ${data.reduce((n, d) => n + d.meetings, 0)}회 · ${Math.round(data.reduce((n, d) => n + d.minutes, 0) / 60)}시간`}
    />
  ),
};

export const calendarLoadWidget: DashboardWidget<
  Awaited<ReturnType<typeof calendarWeekly>>
> = {
  id: "insights.calendar",
  title: "주간 일정 시간",
  surface: "insights",
  size: "md",
  order: 30,
  load: (ctx, range) => calendarWeekly(ctx, range),
  Component: ({ data }) => (
    <ChartCard
      data={data}
      series={[{ key: "hours", label: "시간" }]}
      footer={`주당 평균 ${(data.reduce((n, d) => n + d.hours, 0) / Math.max(1, data.length)).toFixed(1)}시간`}
    />
  ),
};

export const captureConversionWidget: DashboardWidget<
  Awaited<ReturnType<typeof captureWeekly>>
> = {
  id: "insights.capture",
  title: "주간 캡처 → 정리",
  surface: "insights",
  size: "md",
  order: 40,
  load: (ctx, range) => captureWeekly(ctx, range),
  Component: ({ data }) => {
    const captured = data.reduce((n, d) => n + d.captured, 0);
    const resolved = data.reduce((n, d) => n + d.resolved, 0);
    return (
      <ChartCard
        data={data}
        series={[
          { key: "captured", label: "캡처" },
          { key: "resolved", label: "정리" },
        ]}
        footer={
          captured
            ? `전환율 ${Math.round((resolved / captured) * 100)}%`
            : undefined
        }
      />
    );
  },
};

export const patternsWidget: DashboardWidget<
  Awaited<ReturnType<typeof detectPatterns>>["patterns"]
> = {
  id: "insights.patterns",
  title: "패턴",
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

interface CostData {
  monthCost: number;
  prevMonthCost: number;
  calls: number;
  byFeature: Array<{
    feature: string;
    model: string;
    calls: number;
    tokens: number;
    seconds: number;
    cost: number;
  }>;
  daily: Array<{ day: string; cost: number }>;
  perMeeting: number | null;
}
const FEATURE_LABEL: Record<string, string> = {
  chat: "채팅",
  summarize: "회의 요약",
  extract: "기억 추출",
  brief: "브리핑",
  review: "주간 리뷰",
  triage: "캡처 분류",
  embed: "임베딩",
  transcribe_live: "전사(라이브)",
  transcribe_final: "화자 분리",
  voice_input: "음성 입력",
};

export const costWidget: DashboardWidget<CostData> = {
  id: "insights.cost",
  title: "AI 비용",
  surface: "insights",
  size: "lg",
  rows: 3,
  order: 50,
  load: async (ctx) => {
    const m0 = new Date(
      Date.UTC(ctx.now.getUTCFullYear(), ctx.now.getUTCMonth(), 1),
    ).toISOString();
    const m1 = new Date(
      Date.UTC(ctx.now.getUTCFullYear(), ctx.now.getUTCMonth() - 1, 1),
    ).toISOString();
    const [cur, prev, feat, daily, meetings] = await Promise.all([
      ctx.db
        .from("v_llm_usage_monthly")
        .select("cost_usd, calls")
        .eq("user_id", ctx.userId)
        .gte("month", m0)
        .maybeSingle(),
      ctx.db
        .from("v_llm_usage_monthly")
        .select("cost_usd")
        .eq("user_id", ctx.userId)
        .gte("month", m1)
        .lt("month", m0)
        .maybeSingle(),
      ctx.db
        .from("v_llm_usage_by_feature")
        .select("*")
        .eq("user_id", ctx.userId)
        .gte("month", m0)
        .order("cost_usd", { ascending: false }),
      ctx.db
        .from("v_llm_usage_daily")
        .select("day, cost_usd")
        .eq("user_id", ctx.userId)
        .order("day", { ascending: false })
        .limit(30),
      ctx.db
        .from("llm_usage")
        .select("cost_usd, ref")
        .eq("user_id", ctx.userId)
        .gte("created_at", m0)
        .in("feature", ["transcribe_live", "transcribe_final", "summarize"]),
    ]);
    const meetingIds = new Set(
      (meetings.data ?? [])
        .map((r) => (r.ref as { id?: string } | null)?.id)
        .filter(Boolean),
    );
    const meetingCost = (meetings.data ?? []).reduce(
      (n, r) => n + Number(r.cost_usd),
      0,
    );
    return {
      monthCost: Number(cur.data?.cost_usd ?? 0),
      prevMonthCost: Number(prev.data?.cost_usd ?? 0),
      calls: Number(cur.data?.calls ?? 0),
      byFeature: (feat.data ?? []).map((r) => ({
        feature: r.feature ?? "",
        model: r.model ?? "",
        calls: Number(r.calls ?? 0),
        tokens: Number(r.input_tokens ?? 0) + Number(r.output_tokens ?? 0),
        seconds: Number(r.audio_seconds ?? 0),
        cost: Number(r.cost_usd ?? 0),
      })),
      daily: [...(daily.data ?? [])]
        .reverse()
        .map((d) => ({ day: String(d.day), cost: Number(d.cost_usd ?? 0) })),
      perMeeting: meetingIds.size ? meetingCost / meetingIds.size : null,
    };
  },
  Component: ({ data }) => {
    const max = Math.max(0.0001, ...data.daily.map((d) => d.cost));
    return (
      <div className="grid h-full gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3 md:grid-cols-1">
            <StatTile
              label="이번 달 AI 비용"
              value={formatCost(data.monthCost)}
              sub={
                data.prevMonthCost
                  ? `지난달 ${formatCost(data.prevMonthCost)}`
                  : undefined
              }
            />
            <StatTile label="호출" value={data.calls} />
            <StatTile
              label="회의당 평균"
              value={
                data.perMeeting !== null ? formatCost(data.perMeeting) : "-"
              }
            />
          </div>
          {data.daily.length > 0 && (
            <div className="mt-auto">
              <p className="mb-1 text-[11px] text-muted-foreground">
                최근 30일
              </p>
              <div className="flex h-10 items-end gap-px">
                {data.daily.map((d) => (
                  <div
                    key={d.day}
                    className="flex-1 rounded-sm bg-primary/70"
                    style={{ height: `${Math.max(4, (d.cost / max) * 100)}%` }}
                    title={`${d.day}: ${formatCost(d.cost)}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="min-h-0 overflow-y-auto md:border-l md:pl-4">
          {data.byFeature.length === 0 ? (
            <p className="py-4 text-xs text-muted-foreground">
              이번 달 사용 기록이 없어요.
            </p>
          ) : (
            <table className="w-full text-xs tabular-nums">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="pb-1 text-left font-normal">기능</th>
                  <th className="pb-1 text-left font-normal">모델</th>
                  <th className="pb-1 text-right font-normal">호출</th>
                  <th className="pb-1 text-right font-normal">사용량</th>
                  <th className="pb-1 text-right font-normal">비용</th>
                </tr>
              </thead>
              <tbody>
                {data.byFeature.map((r) => (
                  <tr key={`${r.feature}-${r.model}`} className="border-t">
                    <td className="py-1">
                      {FEATURE_LABEL[r.feature] ?? r.feature}
                    </td>
                    <td className="py-1 text-muted-foreground">{r.model}</td>
                    <td className="py-1 text-right">{r.calls}</td>
                    <td className="py-1 text-right">
                      {r.seconds > 0
                        ? `${Math.round(r.seconds / 60)}분`
                        : `${formatTokens(r.tokens)} tok`}
                    </td>
                    <td className="py-1 text-right">{formatCost(r.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  },
};
