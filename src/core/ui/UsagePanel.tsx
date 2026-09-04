import type { Db } from "@/core/contracts";
import { budgetStatus } from "@/core/llm/budget";
import { FEATURE_LABEL } from "@/core/llm/features";
import { ChartCard } from "@/core/ui/charts/lieflat/Card";
import { HairlineLine, TickRows } from "@/core/ui/charts/lieflat/charts";
import { monthStartIso } from "@/core/utils/date";
import { formatCost, formatTokens } from "@/core/utils/format";

/** 이번 달 AI 사용량·비용. 전부 SQL 뷰(LLM 호출 0). */
export async function UsagePanel({ db, userId }: { db: Db; userId: string }) {
  const since = monthStartIso();
  const [budget, byFeature, daily] = await Promise.all([
    budgetStatus(db, userId),
    db
      .from("v_llm_usage_by_feature")
      .select("*")
      .eq("user_id", userId)
      .gte("month", since)
      .order("cost_usd", { ascending: false }),
    db
      .from("v_llm_usage_daily")
      .select("*")
      .eq("user_id", userId)
      .order("day", { ascending: false })
      .limit(30),
  ]);
  const rows = byFeature.data ?? [];
  // 최대 비용이 $1 미만이면 0.1센트 단위로 tick 을 그린다(작은 항목이 0칸이 되지 않게)
  const costUnit =
    Math.max(0, ...rows.map((r) => Number(r.cost_usd ?? 0))) < 1 ? 1000 : 100;
  const totalCalls = rows.reduce((a, r) => a + Number(r.calls ?? 0), 0);

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-xs text-muted-foreground">이번 달 AI 비용</p>
          <p className="text-2xl font-semibold tabular-nums">
            {formatCost(budget.spentUsd)}
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>{totalCalls}회 호출</p>
          {budget.budgetUsd !== null && (
            <p
              className={
                budget.level === "over"
                  ? "text-red-600"
                  : budget.level === "warn"
                    ? "text-amber-600"
                    : ""
              }
            >
              예산 ${budget.budgetUsd} 중{" "}
              {Math.round((budget.ratio ?? 0) * 100)}%
            </p>
          )}
        </div>
      </div>
      {budget.budgetUsd !== null && (
        <div className="h-1.5 overflow-hidden rounded bg-muted">
          <div
            className={`h-full ${budget.level === "over" ? "bg-red-500" : budget.level === "warn" ? "bg-amber-500" : "bg-primary"}`}
            style={{ width: `${Math.min(100, (budget.ratio ?? 0) * 100)}%` }}
          />
        </div>
      )}
      {rows.length > 0 && (
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-normal">기능</th>
              <th className="py-1 text-left font-normal">모델</th>
              <th className="py-1 text-right font-normal">호출</th>
              <th className="py-1 text-right font-normal">토큰·초</th>
              <th className="py-1 text-right font-normal">비용</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((r) => (
              <tr key={`${r.feature}-${r.model}`} className="border-t">
                <td className="py-1">
                  {FEATURE_LABEL[r.feature ?? ""] ?? r.feature}
                </td>
                <td className="py-1 text-muted-foreground">{r.model}</td>
                <td className="py-1 text-right">{r.calls}</td>
                <td className="py-1 text-right">
                  {Number(r.audio_seconds) > 0
                    ? `${r.audio_seconds}s`
                    : formatTokens(
                        Number(r.input_tokens ?? 0) +
                          Number(r.output_tokens ?? 0),
                      )}
                </td>
                <td className="py-1 text-right">
                  {formatCost(Number(r.cost_usd ?? 0))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {(daily.data?.length ?? 0) > 0 && (
        <div className="grid gap-4 border-t pt-3 md:grid-cols-2">
          <ChartCard
            title={`최근 30일 하루 최대 ${formatCost(Math.max(...(daily.data ?? []).map((d) => Number(d.cost_usd ?? 0))))}`}
            sub="하루 AI 비용 · 큰 점 = 가장 비쌌던 이틀"
            source="one dot = one day · usd"
          >
            <HairlineLine
              label="최근 30일 하루 AI 비용"
              format={(v) => formatCost(v)}
              data={[...(daily.data ?? [])].reverse().map((d) => ({
                name: String(d.day).slice(5).replace("-", "/"),
                value: Number(d.cost_usd ?? 0),
              }))}
            />
          </ChartCard>
          {rows.length > 0 && (
            <ChartCard
              title={`이번 달은 ${FEATURE_LABEL[rows[0]?.feature ?? ""] ?? rows[0]?.feature}에 가장 많이 썼어요`}
              sub={`기능별 이번 달 비용 · 1 tick = ${costUnit === 1000 ? "0.1센트" : "1센트"}`}
              source={`one tick = $${costUnit === 1000 ? "0.001" : "0.01"} · rows = features`}
            >
              <TickRows
                label="기능별 이번 달 비용"
                unitName={costUnit === 1000 ? "×$0.001" : "¢"}
                format={(v) => formatCost(v / costUnit)}
                data={rows.slice(0, 6).map((r) => ({
                  name: FEATURE_LABEL[r.feature ?? ""] ?? String(r.feature),
                  value: Math.round(Number(r.cost_usd ?? 0) * costUnit),
                }))}
              />
            </ChartCard>
          )}
        </div>
      )}
      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          아직 이번 달 사용 기록이 없어요.
        </p>
      )}
    </div>
  );
}
