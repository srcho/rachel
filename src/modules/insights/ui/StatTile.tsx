import { cn } from "@/lib/utils";

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
    <div className="rounded-lg border bg-card px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-xl font-semibold tabular-nums",
          tone === "warn" && "text-amber-600",
          tone === "good" && "text-emerald-600",
        )}
      >
        {value}
      </p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
