"use client";
import {
  Bell,
  Brain,
  CalendarDays,
  ChartNoAxesCombined,
  Circle,
  Database,
  Inbox,
  Kanban,
  type LucideIcon,
  Mic,
  Sparkles,
  SquareKanban,
  X,
} from "lucide-react";

/**
 * 모듈 manifest/커맨드의 lucide 아이콘 이름(kebab-case) → 컴포넌트.
 * `lucide-react/dynamic` 은 전체 아이콘 인덱스(≈20KB gz)를 첫 로드에 싣기 때문에
 * 실제로 쓰는 이름만 정적으로 매핑한다. 새 모듈이 아이콘을 추가하면 여기에 등록.
 */
const ICONS: Record<string, LucideIcon> = {
  bell: Bell,
  brain: Brain,
  "calendar-days": CalendarDays,
  "chart-no-axes-combined": ChartNoAxesCombined,
  database: Database,
  inbox: Inbox,
  kanban: Kanban,
  mic: Mic,
  sparkles: Sparkles,
  "square-kanban": SquareKanban,
  x: X,
};

export function ModuleIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Icon = ICONS[name] ?? Circle;
  return <Icon className={className} aria-hidden />;
}
