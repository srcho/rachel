import { requireUser } from "@/core/auth/session";
import { AppShell } from "@/core/ui/AppShell";
import { registry } from "@/modules";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  const nav = registry.nav().map((n) => ({
    id: n.id,
    name: n.name,
    icon: n.icon,
    href: n.href,
    mobileTab: n.mobileTab,
  }));
  return <AppShell nav={nav}>{children}</AppShell>;
}
