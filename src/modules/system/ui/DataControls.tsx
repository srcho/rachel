"use client";
import { Download, Save } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { backupNowAction } from "../actions";

export function DataControls({
  backups,
}: {
  backups: Array<{ name: string; bytes: number; createdAt: string }>;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p>내 데이터는 언제든 통째로 가져갈 수 있어요.</p>
          <p className="text-xs text-muted-foreground">
            JSON 전체 내보내기 · 매주 토요일 새벽 자동 백업(최근 8주 보관,
            오디오 제외)
          </p>
        </div>
        <div className="flex gap-1">
          <Button asChild size="sm" variant="outline">
            <a href="/api/export" download>
              <Download className="size-4" /> 내보내기
            </a>
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await backupNowAction();
                toast.success(`백업 완료 (${Math.round(r.bytes / 1024)} KB)`);
              })
            }
          >
            <Save className="size-4" /> 지금 백업
          </Button>
        </div>
      </div>
      {backups.length > 0 && (
        <ul className="text-xs text-muted-foreground">
          {backups.slice(0, 4).map((b) => (
            <li key={b.name}>
              {b.name.replace(".json.gz", "")} · {Math.round(b.bytes / 1024)} KB
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
