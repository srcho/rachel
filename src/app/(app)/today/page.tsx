import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { Page } from "@/core/ui/Page";
import { PageHeader } from "@/core/ui/PageHeader";
import { WidgetGrid } from "@/core/ui/WidgetGrid";
import { registry } from "@/modules";

export const dynamic = "force-dynamic";

/** Today: 하루의 시작점. 캡처 한 줄 → 브리핑·일정·할 일·회의 2×2. 카드는 내용 높이(같은 줄끼리만 맞춤). */
export default async function TodayPage() {
  const user = await requireUser();
  const db = await createServerSupabase();
  const ctx = createContext({ db, userId: user.id, actor: "user", registry });
  const now = ctx.now;
  const range = {
    from: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    to: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
  };
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
      <PageHeader title="Today" meta={dateLabel} />
      <Page width="content">
        <WidgetGrid items={loaded} range={range} rowsMode="auto" />
      </Page>
    </>
  );
}
