import { after } from "next/server";
import { requireUser } from "@/core/auth/session";
import { OutboxReplayer } from "@/core/offline/OutboxReplayer";
import { AppShell } from "@/core/ui/AppShell";
import { registry } from "@/modules";
import { RachelFab } from "@/modules/agent/dock/RachelFab";
import { RachelPanel } from "@/modules/agent/dock/RachelPanel";
import { maybeTriggerSync } from "@/modules/calendar/trigger";
import { PaletteHost } from "./_ui/PaletteHost";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  // 앱을 열 때 캘린더가 5분 넘게 묵었으면 동기화 잡을 건다(응답 뒤에)
  after(() => maybeTriggerSync(user.id));
  // 코어 항목(Today·설정) + 모듈 nav. 모바일 탭은 Today·할 일·일정·회의·설정 다섯.
  const nav = [
    {
      id: "today",
      name: "Today",
      icon: "sun",
      href: "/today",
      mobileTab: true,
    },
    ...registry.nav().map((n) => ({
      id: n.id,
      name: n.name,
      icon: n.icon,
      href: n.href,
      mobileTab: n.mobileTab,
    })),
    {
      id: "settings",
      name: "설정",
      icon: "settings",
      href: "/settings",
      mobileTab: true,
    },
  ];
  return (
    <AppShell nav={nav} dock={{ fab: <RachelFab />, panel: <RachelPanel /> }}>
      {children}
      <PaletteHost commands={registry.commands()} />
      <OutboxReplayer />
    </AppShell>
  );
}
