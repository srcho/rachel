import type { DashboardWidget } from "@/core/contracts";
import { localYmd } from "@/core/utils/date";
import { formatCost } from "@/modules/agent/dock/CostChip";
import { insightsRepository } from "./repository";
import { BriefCard } from "./ui/BriefCard";

export interface BriefData {
  contentMd: string | null;
  generatedAt: string | null;
  costUsd: number | null;
  today: string;
}

/** 브리핑 카드. 캐시가 없으면 카드가 클라이언트에서 생성을 요청한다(첫 접속 1회). */
export const briefWidget: DashboardWidget<BriefData> = {
  id: "insights.brief",
  title: "브리핑",
  surface: "today",
  size: "lg",
  order: 0,
  load: async (ctx) => {
    const today = localYmd(ctx.now, ctx.timezone);
    const row = await insightsRepository(ctx.db, ctx.userId).get(
      "daily_brief",
      today,
    );
    let costUsd: number | null = null;
    if (row) {
      const { data } = await ctx.db
        .from("llm_usage")
        .select("cost_usd")
        .eq("user_id", ctx.userId)
        .contains("ref", { type: "insight", id: `daily_brief:${today}` })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      costUsd = data ? Number(data.cost_usd) : null;
    }
    return {
      contentMd: row?.content_md ?? null,
      generatedAt: row?.updated_at ?? null,
      costUsd,
      today,
    };
  },
  Component: ({ data }) => (
    <BriefCard
      data={data}
      costLabel={data.costUsd !== null ? formatCost(data.costUsd) : null}
    />
  ),
};
