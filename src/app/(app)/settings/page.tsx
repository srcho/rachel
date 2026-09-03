import { Button } from "@/components/ui/button";
import { signOut } from "@/core/auth/actions";
import { requireUser } from "@/core/auth/session";
import { createServerSupabase } from "@/core/db/server";
import { saveBudgetAction, saveHonorificAction } from "@/core/settings/actions";
import { getProfileSettings } from "@/core/settings/profile";
import { PageHeader } from "@/core/ui/PageHeader";
import { ThemeToggle } from "@/core/ui/ThemeToggle";
import { UsagePanel } from "@/core/ui/UsagePanel";
import { registry } from "@/modules";

export const dynamic = "force-dynamic";

const field =
  "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/50";

export default async function SettingsPage() {
  const user = await requireUser();
  const db = await createServerSupabase();
  const settings = await getProfileSettings(db, user.id);
  const sections = registry.settings();
  return (
    <>
      <PageHeader title="설정" />
      <div className="mx-auto max-w-2xl space-y-8 p-4">
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">계정</h2>
          <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
            <span>{user.email ?? user.id}</span>
            <form action={signOut}>
              <Button variant="outline" size="sm" type="submit">
                로그아웃
              </Button>
            </form>
          </div>
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">레이첼</h2>
          <form
            action={saveHonorificAction}
            className="flex items-end gap-2 rounded-lg border p-3"
          >
            <label className="flex-1 space-y-1 text-sm">
              <span className="text-xs text-muted-foreground">
                레이첼이 부르는 호칭
              </span>
              <input
                name="honorific"
                defaultValue={settings.honorific ?? "빈센트님"}
                className={field}
                maxLength={20}
              />
            </label>
            <Button size="sm" type="submit">
              저장
            </Button>
          </form>
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            AI 사용량·비용
          </h2>
          <UsagePanel db={db} userId={user.id} />
          <form
            action={saveBudgetAction}
            className="flex items-end gap-2 rounded-lg border p-3"
          >
            <label className="flex-1 space-y-1 text-sm">
              <span className="text-xs text-muted-foreground">
                월 예산 (USD, 비우면 표시만)
              </span>
              <input
                name="budget"
                type="number"
                step="1"
                min="1"
                defaultValue={settings.monthlyBudgetUsd ?? ""}
                className={field}
                placeholder="예: 15"
              />
            </label>
            <Button size="sm" type="submit" variant="outline">
              저장
            </Button>
          </form>
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">테마</h2>
          <ThemeToggle />
        </section>
        {sections.map((s) => (
          <section key={s.id} className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              {s.title}
            </h2>
            <s.Component />
          </section>
        ))}
      </div>
    </>
  );
}
