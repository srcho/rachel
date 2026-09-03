"use client";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDock } from "./store";

export function DesktopDockButton() {
  const { open, toggle } = useDock();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant={open ? "default" : "ghost"}
          className="size-9"
          onClick={toggle}
          aria-label="레이첼 (Shift+Space)"
        >
          <Sparkles className="size-[18px]" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        레이첼 <kbd className="ml-1 opacity-70">⇧ Space</kbd>
      </TooltipContent>
    </Tooltip>
  );
}
