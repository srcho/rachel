"use client";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { generateBriefAction } from "../actions";
import type { BriefData } from "../widgets";

/** 레이첼의 아침 브리핑 본문. 프레임은 WidgetGrid 의 Panel 이 그린다. */
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
    } catch (e) {
      console.warn("[brief] 생성 실패", e instanceof Error ? e.message : e);
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

  return data.contentMd ? (
    <div className="space-y-1 text-sm leading-relaxed">
      {data.contentMd.split("\n").map((line, i) => (
        <p
          key={`${i}-${line.slice(0, 8)}`}
          className={cn(
            line.startsWith("- ") && "pl-3 before:mr-1.5 before:content-['·']",
          )}
        >
          {line.replace(/^- /, "").replace(/\*\*(.+?)\*\*/g, "$1")}
        </p>
      ))}
    </div>
  ) : (
    <p className="flex h-full min-h-16 items-center text-sm text-muted-foreground">
      {loading ? "오늘 브리핑을 준비하고 있어요…" : "브리핑이 아직 없어요."}
    </p>
  );
}

/** Panel 헤더용: 비용 + 다시 생성 */
export function BriefActions({ costLabel }: { costLabel: string | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <>
      {costLabel && <span className="tabular-nums">{costLabel}</span>}
      <Button
        size="icon-xs"
        variant="ghost"
        disabled={loading}
        aria-label="브리핑 다시 생성"
        onClick={async () => {
          setLoading(true);
          try {
            await generateBriefAction(true);
            router.refresh();
          } finally {
            setLoading(false);
          }
        }}
      >
        <RefreshCw className={cn("size-3", loading && "animate-spin")} />
      </Button>
    </>
  );
}
