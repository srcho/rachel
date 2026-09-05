import { after } from "next/server";
import { requireUser } from "@/core/auth/session";
import { createContext } from "@/core/context";
import { createServerSupabase } from "@/core/db/server";
import { OutboxReplayer } from "@/core/offline/OutboxReplayer";
import { AppShell } from "@/core/ui/AppShell";
import { registry } from "@/modules";
import { RachelFab } from "@/modules/agent/dock/RachelFab";
import { RachelPanel } from "@/modules/agent/dock/RachelPanel";
import { maybeTriggerSync } from "@/modules/calendar/trigger";
import { CaptureOutbox } from "@/modules/capture/ui/CaptureOutbox";
import { QuickCapture } from "@/modules/capture/ui/QuickCapture";
import { scheduleReminders } from "@/modules/notify/reminders";
import { TaskOutbox } from "@/modules/tasks/ui/TaskOutbox";
import { PaletteHost } from "./_ui/PaletteHost";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  // 앱을 열 때 캘린더가 5분 넘게 묵었으면 동기화 잡을 건다(응답 뒤에)
  const syncContext = createContext({
    db: await createServerSupabase(),
    userId: user.id,
    actor: "system",
    registry,
  });
  after(async () => {
    const results = await Promise.allSettled([
      maybeTriggerSync(syncContext),
      scheduleReminders(syncContext),
    ]);
    for (const r of results)
      if (r.status === "rejected")
        console.error("[app] background refresh", r.reason);
  });
  // 코어 항목(Today·설정) + 모듈 nav. 모바일 탭은 Today·할 일·일정·회의·설정 다섯.
  const nav = [
    {
      id: "today",
      name: "오늘",
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
    <AppShell
      nav={nav}
      dock={{
        fab: (
          <>
            <QuickCapture userId={user.id} />
            <RachelFab />
          </>
        ),
        panel: <RachelPanel userId={user.id} />,
      }}
    >
      {children}
      <PaletteHost commands={registry.commands()} />
      <TaskOutbox />
      <CaptureOutbox />
      <OutboxReplayer userId={user.id} />
    </AppShell>
  );
}
