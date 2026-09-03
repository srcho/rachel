import { cn } from "@/lib/utils";

/** Panel 안에서 쓰는 숫자 타일. 자체 테두리 없음 — 부모가 grid 로 나란히 놓는다. */
export function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "warn" | "good";
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-xl font-semibold tabular-nums leading-tight",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {value}
      </p>
      {sub && (
        <p className="truncate text-[11px] text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}
