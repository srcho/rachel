import type { Db } from "@/core/contracts";
import { env } from "@/core/env";
import { getProfileSettings } from "@/core/settings/profile";
import { monthStartIso } from "@/core/utils/date";

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
  // 설정 화면의 월 예산이 우선, 없으면 env
  const settings = await getProfileSettings(db, userId);
  const budget =
    settings.monthlyBudgetUsd ?? env().LLM_MONTHLY_BUDGET_USD ?? null;
  const { data, error } = await db
    .from("v_llm_usage_monthly")
    .select("cost_usd")
    .eq("user_id", userId)
    .gte("month", monthStartIso())
    .maybeSingle();
  if (error)
    throw new Error("사용량을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
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
