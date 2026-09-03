"use client";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { generateBriefAction } from "../actions";
import type { BriefData } from "../widgets";

export function BriefCard({
  data,
  costLabel,
}: {
  data: BriefData;
  costLabel: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const requested = useRef(false);

  async function generate(force: boolean) {
    setLoading(true);
    try {
      await generateBriefAction(force);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  // 오늘 브리핑이 없으면 첫 접속 때 한 번만 자동 생성
  // biome-ignore lint/correctness/useExhaustiveDependencies: 마운트 시 1회만
  useEffect(() => {
    if (!data.contentMd && !requested.current) {
      requested.current = true;
      void generate(false);
    }
  }, []);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium">레이첼의 브리핑</h3>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {costLabel && <span className="tabular-nums">{costLabel}</span>}
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => generate(true)}
            disabled={loading}
            aria-label="다시 생성"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>
      {data.contentMd ? (
        <div className="space-y-1 text-sm leading-relaxed">
          {data.contentMd.split("\n").map((line, i) => (
            <p
              key={`${i}-${line.slice(0, 8)}`}
              className={cn(
                line.startsWith("- ") &&
                  "pl-3 before:mr-1.5 before:content-['·']",
              )}
            >
              {line.replace(/^- /, "").replace(/\*\*(.+?)\*\*/g, "$1")}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {loading ? "오늘 브리핑을 준비하고 있어요…" : "브리핑이 아직 없어요."}
        </p>
      )}
    </div>
  );
}
