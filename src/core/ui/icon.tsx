"use client";
import { DynamicIcon, type IconName } from "lucide-react/dynamic";

/** 모듈 manifest 의 lucide 아이콘 이름(kebab-case)을 렌더한다. */
export function ModuleIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <DynamicIcon name={name as IconName} className={className} aria-hidden />
  );
}
