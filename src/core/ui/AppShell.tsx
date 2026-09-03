import { TooltipProvider } from "@/components/ui/tooltip";
import { DesktopRail } from "./DesktopRail";
import { MobileTabs } from "./MobileTabs";
import type { NavItem } from "./nav-types";

export interface AppShellProps {
  nav: NavItem[];
  /** 레이첼 Dock(우하단 FAB + 패널/드로어). agent 모듈이 주입한다. */
  dock?: { fab: React.ReactNode; panel: React.ReactNode };
  children: React.ReactNode;
}

/**
 * 모바일: 하단 탭 5개(Today·할 일·일정·회의·설정) + 우하단 FAB.
 * 데스크톱: 좌측 레일(설정은 맨 아래) + 본문 + 플로팅 레이첼 창.
 */
export function AppShell({ nav, dock, children }: AppShellProps) {
  const settings = nav.find((n) => n.id === "settings");
  const main = nav.filter((n) => n.id !== "settings");
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-dvh">
        <DesktopRail items={main} footer={settings} />
        <main className="min-w-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] has-[[data-immersive]]:pb-0 md:pb-0">
          {children}
        </main>
      </div>
      <MobileTabs items={nav} />
      {dock?.fab}
      {dock?.panel}
    </TooltipProvider>
  );
}
