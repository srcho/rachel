import { requireUser } from "@/core/auth/session";
import { AppShell } from "@/core/ui/AppShell";
import { registry } from "@/modules";
import { DesktopDockButton } from "@/modules/agent/dock/DesktopDockButton";
import { RachelFab } from "@/modules/agent/dock/RachelFab";
import { RachelPanel } from "@/modules/agent/dock/RachelPanel";

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
  return (
    <AppShell
      nav={nav}
      dock={{ fab: <RachelFab />, panel: <RachelPanel /> }}
      railFooter={<DesktopDockButton />}
    >
      {children}
    </AppShell>
  );
}
