import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { PageHeader } from "@/core/ui/PageHeader";
import { WidgetGrid } from "@/core/ui/WidgetGrid";
import { registry } from "@/modules";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const user = await requireUser();
  const db = await createServerSupabase();
  const ctx = createContext({ db, userId: user.id, actor: "user", registry });
  const now = new Date();
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
  return (
    <>
      <PageHeader title="Today" />
      <div className="mx-auto max-w-5xl p-4">
        <WidgetGrid items={loaded} range={range} />
      </div>
    </>
  );
}
