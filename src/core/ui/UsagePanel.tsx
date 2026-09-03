import type { Db } from "@/core/contracts";
import { budgetStatus } from "@/core/llm/budget";
import { formatCost, formatTokens } from "@/modules/agent/dock/CostChip";

const FEATURE_LABEL: Record<string, string> = {
  chat: "채팅",
  summarize: "회의 요약",
  extract: "기억 추출",
  brief: "브리핑",
  review: "주간 리뷰",
  triage: "캡처 분류",
  embed: "임베딩",
  transcribe_live: "전사(라이브)",
  transcribe_final: "전사(파이널)",
  voice_input: "음성 입력",
};

/** 이번 달 AI 사용량·비용. 전부 SQL 뷰(LLM 호출 0). */
export async function UsagePanel({ db, userId }: { db: Db; userId: string }) {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const since = monthStart.toISOString();
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
      .limit(14),
  ]);
  const rows = byFeature.data ?? [];
  const totalCalls = rows.reduce((a, r) => a + Number(r.calls ?? 0), 0);
  const maxDaily = Math.max(
    0.0001,
    ...(daily.data ?? []).map((d) => Number(d.cost_usd ?? 0)),
  );

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
        <div>
          <p className="mb-1 text-xs text-muted-foreground">최근 14일</p>
          <div className="flex h-12 items-end gap-0.5">
            {[...(daily.data ?? [])].reverse().map((d) => (
              <div
                key={String(d.day)}
                className="flex-1 rounded-sm bg-primary/70"
                style={{
                  height: `${Math.max(4, (Number(d.cost_usd ?? 0) / maxDaily) * 100)}%`,
                }}
                title={`${d.day}: ${formatCost(Number(d.cost_usd ?? 0))} · ${d.calls}회`}
              />
            ))}
          </div>
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
