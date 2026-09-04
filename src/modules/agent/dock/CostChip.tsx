import { formatCost, formatTokens } from "@/core/utils/format";

export { formatCost, formatTokens };

export function CostChip({
  costUsd,
  inputTokens,
  outputTokens,
}: {
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
}) {
  if (costUsd === undefined) return null;
  const tokens = (inputTokens ?? 0) + (outputTokens ?? 0);
  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-px text-[10px] tabular-nums text-muted-foreground"
      title={`입력 ${inputTokens ?? 0} · 출력 ${outputTokens ?? 0} 토큰`}
    >
      {formatTokens(tokens)} tok · {formatCost(costUsd)}
    </span>
  );
}
