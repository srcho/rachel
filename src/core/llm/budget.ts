import type { Db } from "@/core/contracts";
import { env } from "@/core/env";

export interface BudgetStatus {
  budgetUsd: number | null;
  spentUsd: number;
  ratio: number | null;
  level: "ok" | "warn" | "over";
}

/** 이번 달 지출과 예산 비교. 예산이 없으면 항상 ok(표시만). */
export async function budgetStatus(
  db: Db,
  userId: string,
): Promise<BudgetStatus> {
  const budget = env().LLM_MONTHLY_BUDGET_USD ?? null;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { data } = await db
    .from("v_llm_usage_monthly")
    .select("cost_usd")
    .eq("user_id", userId)
    .gte("month", monthStart.toISOString())
    .maybeSingle();
  const spent = Number(data?.cost_usd ?? 0);
  if (!budget)
    return { budgetUsd: null, spentUsd: spent, ratio: null, level: "ok" };
  const ratio = spent / budget;
  return {
    budgetUsd: budget,
    spentUsd: spent,
    ratio,
    level: ratio >= 1 ? "over" : ratio >= 0.8 ? "warn" : "ok",
  };
}
