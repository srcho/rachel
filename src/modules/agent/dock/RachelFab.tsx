"use client";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDock } from "./store";

export function RachelFab() {
  const { open, toggle } = useDock();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="레이첼 열기"
      aria-pressed={open}
      className={cn(
        "-mt-5 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition-transform active:scale-95",
        open && "bg-primary/80",
      )}
    >
      <Sparkles className="size-5" />
    </button>
  );
}
