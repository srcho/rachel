"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ModuleIcon } from "./icon";
import type { NavItem } from "./nav-types";

/** 모바일 하단 탭. 중앙에 레이첼 FAB 자리를 비워 둔다(agent 모듈이 채운다). */
export function MobileTabs({
  items,
  fab,
}: {
  items: NavItem[];
  fab?: React.ReactNode;
}) {
  const pathname = usePathname();
  const tabs = items.filter((i) => i.mobileTab).slice(0, 4);
  const left = tabs.slice(0, 2);
  const right = tabs.slice(2, 4);
  const Tab = ({ item }: { item: NavItem }) => {
    const active =
      pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <Link
        href={item.href}
        className={cn(
          "flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[11px]",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        aria-current={active ? "page" : undefined}
      >
        <ModuleIcon name={item.icon} className="size-5" />
        {item.name}
      </Link>
    );
  };
  return (
    <nav
      aria-label="주 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="mx-auto flex max-w-lg items-center">
        {left.map((i) => (
          <Tab key={i.id} item={i} />
        ))}
        <div className="flex w-16 justify-center">{fab}</div>
        {right.map((i) => (
          <Tab key={i.id} item={i} />
        ))}
      </div>
    </nav>
  );
}
