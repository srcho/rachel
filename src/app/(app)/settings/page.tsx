import { Button } from "@/components/ui/button";
import { signOut } from "@/core/auth/actions";
import { requireUser } from "@/core/auth/session";
import { createServerSupabase } from "@/core/db/server";
import { AssistantPreferences } from "@/core/settings/AssistantPreferences";
import { saveBudgetAction, saveHonorificAction } from "@/core/settings/actions";
import { getUserTimezone } from "@/core/settings/assistant";
import { getProfileSettings } from "@/core/settings/profile";
import { Page } from "@/core/ui/Page";
import { PageHeader } from "@/core/ui/PageHeader";
import { Panel } from "@/core/ui/Panel";
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
  const timezone = await getUserTimezone(db, user.id);
  const sections = registry.settings();
  return (
    <>
      <PageHeader title="설정" />
      <Page width="narrow" className="space-y-3">
        <Panel
          title="계정"
          action={
            <form action={signOut}>
              <Button variant="ghost" size="xs" type="submit">
                로그아웃
              </Button>
            </form>
          }
        >
          <p className="break-all text-sm">{user.email ?? user.id}</p>
        </Panel>
        <Panel title="레이첼">
          <form action={saveHonorificAction} className="flex items-end gap-2">
            <label className="min-w-0 flex-1 space-y-1 text-sm">
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
        </Panel>
        <Panel title="비서 선호">
          <AssistantPreferences
            preferences={settings.assistant ?? {}}
            timezone={timezone}
          />
        </Panel>
        <Panel title="AI 사용량·비용">
          <UsagePanel db={db} userId={user.id} />
          <form
            action={saveBudgetAction}
            className="mt-3 flex items-end gap-2 border-t pt-3"
          >
            <label className="min-w-0 flex-1 space-y-1 text-sm">
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
        </Panel>
        <Panel title="테마">
          <ThemeToggle />
        </Panel>
        {sections.map((s) => (
          <Panel key={s.id} title={s.title}>
            <s.Component />
          </Panel>
        ))}
      </Page>
    </>
  );
}
