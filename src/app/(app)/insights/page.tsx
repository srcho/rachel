import Link from "next/link";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { PageHeader } from "@/core/ui/PageHeader";
import { WidgetGrid } from "@/core/ui/WidgetGrid";
import { cn } from "@/lib/utils";
import { registry } from "@/modules";
import { insightsRepository } from "@/modules/insights/repository";
import { ReviewList } from "@/modules/insights/ui/ReviewList";

export const dynamic = "force-dynamic";

const RANGES = {
  week: { label: "4주", weeks: 4 },
  month: { label: "3개월", weeks: 13 },
  quarter: { label: "6개월", weeks: 26 },
} as const;
type RangeKey = keyof typeof RANGES;

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const db = await createServerSupabase();
  const ctx = createContext({ db, userId: user.id, actor: "user", registry });
  const key: RangeKey =
    (sp.range as RangeKey) in RANGES ? (sp.range as RangeKey) : "week";
  const range = {
    from: new Date(ctx.now.getTime() - RANGES[key].weeks * 7 * 86_400_000),
    to: new Date(ctx.now.getTime() + 86_400_000),
  };
  const widgets = registry.widgets("insights");
  const loaded = await Promise.all(
    widgets.map(async (w) => {
      try {
        return {
          widget: w,
          data: await w.load(ctx, range),
          error: null as string | null,
        };
      } catch (e) {
        return {
          widget: w,
          data: null,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }),
  );
  const reviews = await insightsRepository(db, user.id).list(
    "weekly_review",
    8,
  );
  return (
    <>
      <PageHeader
        title="인사이트"
        actions={
          <div className="flex rounded-md border p-0.5 text-xs">
            {(Object.keys(RANGES) as RangeKey[]).map((k) => (
              <Link
                key={k}
                href={`/insights?range=${k}`}
                className={cn(
                  "rounded px-2 py-1",
                  k === key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {RANGES[k].label}
              </Link>
            ))}
          </div>
        }
      />
      <div className="mx-auto max-w-5xl space-y-6 p-4">
        <WidgetGrid items={loaded} range={range} />
        <ReviewList
          reviews={reviews.map((r) => ({
            id: r.id,
            periodStart: r.period_start,
            periodEnd: r.period_end,
            contentMd: r.content_md,
            createdAt: r.created_at,
          }))}
        />
      </div>
    </>
  );
}
