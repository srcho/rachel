import { Button } from "@/components/ui/button";
import { signOut } from "@/core/auth/actions";
import { requireUser } from "@/core/auth/session";
import { PageHeader } from "@/core/ui/PageHeader";
import { ThemeToggle } from "@/core/ui/ThemeToggle";
import { registry } from "@/modules";

export default async function SettingsPage() {
  const user = await requireUser();
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
