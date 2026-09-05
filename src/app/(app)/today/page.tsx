import { userContext } from "@/core/context";
import { Page } from "@/core/ui/Page";
import { PageHeader } from "@/core/ui/PageHeader";
import { WidgetGrid } from "@/core/ui/WidgetGrid";
import { dayBounds } from "@/core/utils/date";
import { registry } from "@/modules";

export const dynamic = "force-dynamic";

/** Today: 하루의 시작점. 캡처 한 줄 → 브리핑·일정·할 일·회의 2×2. 카드는 내용 높이(같은 줄끼리만 맞춤). */
export default async function TodayPage() {
  const ctx = await userContext();
  const now = ctx.now;
  const bounds = dayBounds(now, ctx.timezone);
  const range = { from: new Date(bounds.start), to: new Date(bounds.end) };
  const widgets = registry.widgets("today");
  const loaded = await Promise.all(
    widgets.map(async (w) => {
      try {
        return {
          widget: w,
          data: await w.load(ctx, range),
          error: null as string | null,
        };
      } catch (e) {
        console.error("[today] widget load failed", w.id, e);
        return {
          widget: w,
          data: null,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }),
  );
  const dateLabel = new Intl.DateTimeFormat("ko-KR", {
    timeZone: ctx.timezone,
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(now);
  return (
    <>
      <PageHeader title="오늘" meta={dateLabel} />
      <Page width="content">
        <WidgetGrid items={loaded} range={range} rowsMode="auto" />
      </Page>
    </>
  );
}
