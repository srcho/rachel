"use client";
import { useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { setCalendarSelectedAction } from "../actions";

export function CalendarToggle({
  id,
  selected,
}: {
  id: string;
  selected: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <Switch
      checked={selected}
      disabled={pending}
      onCheckedChange={(v) => start(() => setCalendarSelectedAction(id, v))}
      aria-label="동기화"
    />
  );
}
