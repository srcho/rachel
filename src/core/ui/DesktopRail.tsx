"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ModuleIcon } from "./icon";
import type { NavItem } from "./nav-types";

export function DesktopRail({
  items,
  footer,
}: {
  items: NavItem[];
  /** 레일 맨 아래 항목(설정) */
  footer?: NavItem;
}) {
  const pathname = usePathname();
  const Item = ({ item }: { item: NavItem }) => {
    const active =
      pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex size-9 items-center justify-center rounded-md",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <ModuleIcon name={item.icon} className="size-[18px]" />
            <span className="sr-only">{item.name}</span>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{item.name}</TooltipContent>
      </Tooltip>
    );
  };
  return (
    <aside className="sticky top-0 hidden h-dvh w-14 shrink-0 flex-col items-center border-r bg-background py-3 md:flex">
      <Link
        href="/today"
        className="mb-3 flex size-8 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground"
      >
        R
      </Link>
      <nav aria-label="주 메뉴" className="flex flex-col gap-1">
        {items
          .filter((i) => i.id !== "today")
          .map((item) => (
            <Item key={item.id} item={item} />
          ))}
      </nav>
      <div className="mt-auto">{footer && <Item item={footer} />}</div>
    </aside>
  );
}
