"use client";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { pullGtasksAction, setGtasksEnabledAction } from "../actions";
import type { GtasksStatus } from "../gtasks";

/** 설정 > Google 캘린더 > "할 일을 Google Tasks 에 비추기" */
export function GtasksToggle({ status }: { status: GtasksStatus }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center justify-between gap-3 border-t pt-3">
      <div className="min-w-0">
        <p>마감 있는 카드를 Google Tasks 에 비추기</p>
        <p className="text-xs text-muted-foreground">
          {!status.hasScope
            ? "Google Tasks 권한이 없어요. 위에서 다시 연결하면 권한을 받아요."
            : status.enabled
              ? `Google 캘린더의 "Rachel" 목록에 보여요 · 연결된 카드 ${status.linked}개 · Google 에서 완료·제목·마감을 바꾸면 카드에 반영돼요(15분마다)`
              : "켜면 마감 있는 카드가 Google 캘린더 옆 할 일 목록에 나타나요."}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {status.enabled && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="지금 가져오기"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await pullGtasksAction();
                toast.success(
                  `가져왔어요: 변경 ${r.changed} · 새 항목 ${r.created}`,
                );
              })
            }
          >
            <RefreshCw className={pending ? "animate-spin" : ""} />
          </Button>
        )}
        {!status.hasScope && status.connected ? (
          <Button asChild size="sm" variant="outline">
            <Link
              href="/api/integrations/google/start?next=/settings"
              prefetch={false}
            >
              권한 받기
            </Link>
          </Button>
        ) : (
          <Switch
            checked={status.enabled}
            disabled={pending || !status.hasScope}
            aria-label="Google Tasks 미러"
            onCheckedChange={(v) =>
              start(async () => {
                try {
                  await setGtasksEnabledAction(v);
                  toast.success(
                    v ? "Google Tasks 에 비추기 시작" : "미러를 껐어요",
                  );
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "실패");
                }
              })
            }
          />
        )}
      </div>
    </div>
  );
}
