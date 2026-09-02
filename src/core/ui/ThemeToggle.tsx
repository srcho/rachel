"use client";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const OPTIONS = [
  ["light", "라이트"],
  ["dark", "다크"],
  ["system", "시스템"],
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="테마">
      {OPTIONS.map(([value, label]) => (
        <Button
          key={value}
          size="sm"
          variant={mounted && theme === value ? "default" : "outline"}
          role="radio"
          aria-checked={mounted && theme === value}
          onClick={() => setTheme(value)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
