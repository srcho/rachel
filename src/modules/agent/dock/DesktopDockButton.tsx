"use client";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDock } from "./store";

export function DesktopDockButton() {
  const { open, toggle } = useDock();
  return (
    <Button
      size="icon"
      variant={open ? "default" : "ghost"}
      className="size-9"
      onClick={toggle}
      aria-label="레이첼 (⌘J)"
      title="레이첼 (⌘J)"
    >
      <Sparkles className="size-[18px]" />
    </Button>
  );
}
