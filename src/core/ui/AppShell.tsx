import { TooltipProvider } from "@/components/ui/tooltip";
import { DesktopRail } from "./DesktopRail";
import { MobileTabs } from "./MobileTabs";
import type { NavItem } from "./nav-types";

export interface AppShellProps {
  nav: NavItem[];
  /** 레이첼 Dock(FAB + 패널). agent 모듈이 주입한다. */
  dock?: { fab: React.ReactNode; panel: React.ReactNode };
  railFooter?: React.ReactNode;
  children: React.ReactNode;
}

/** 모바일: 하단 탭 + 중앙 FAB. 데스크톱: 좌측 레일 + 본문 + (우측 패널은 dock.panel). */
export function AppShell({ nav, dock, railFooter, children }: AppShellProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-dvh">
        <DesktopRail items={nav} footer={railFooter} />
        <div className="flex min-w-0 flex-1">
          <main className="min-w-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
            {children}
          </main>
          {dock?.panel}
        </div>
      </div>
      <MobileTabs items={nav} fab={dock?.fab} />
    </TooltipProvider>
  );
}
