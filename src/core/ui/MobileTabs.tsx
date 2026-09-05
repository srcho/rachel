"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ModuleIcon } from "./icon";
import type { NavItem } from "./nav-types";

/** 모바일 하단 탭(최대 5). 회의 녹음 화면에서는 숨긴다(컨트롤 바가 그 자리를 쓴다). */
export function MobileTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  if (pathname.startsWith("/meetings/live/")) return null;
  const tabs = items
    .filter((i) => i.mobileTab)
    .slice(0, 5)
    .map((item) =>
      item.id === "settings"
        ? { ...item, id: "more", name: "더보기", href: "/more" }
        : item,
    );
  return (
    <nav
      aria-label="주 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <div className="mx-auto flex max-w-lg items-center">
        {tabs.map((item) => {
          const active =
            pathname === item.href ||
            pathname.startsWith(`${item.href}/`) ||
            (item.id === "more" &&
              ["/settings", "/memory", "/capture", "/insights"].some((path) =>
                pathname.startsWith(path),
              ));
          return (
            <Link
              key={item.id}
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
        })}
      </div>
    </nav>
  );
}
