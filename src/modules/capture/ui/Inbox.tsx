"use client";
import { Check, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTableChanges } from "@/core/realtime/useTableChanges";
import { Panel } from "@/core/ui/Panel";
import { DEFAULT_TZ, fmtDateTime } from "@/core/utils/date";
import { cn } from "@/lib/utils";
import {
  dismissCaptureAction,
  resolveCaptureAction,
  retriageAction,
} from "../actions";
import { type Triage, triageSchema } from "../schema";
import type { CaptureRow } from "../service";
import { CaptureReview } from "./CaptureReview";

const TYPE_LABEL: Record<string, string> = {
  task: "할 일",
  event: "일정",
  memory: "기억",
  note: "메모",
};

function proposalText(t: Triage): string {
  if (t.type === "task" && t.task)
    return `${t.task.title}${t.task.due ? ` · ${Number.isFinite(Date.parse(t.task.due)) ? fmtDateTime(t.task.due, DEFAULT_TZ) : "날짜 확인 필요"}` : ""} · P${t.task.priority}`;
  if (t.type === "event" && t.event)
    return `${t.event.title} · ${Number.isFinite(Date.parse(t.event.startAt)) ? fmtDateTime(t.event.startAt, DEFAULT_TZ) : "날짜 확인 필요"}`;
  if (t.type === "memory" && t.memory) return t.memory.content;
  return "메모로 보관";
}

export function Inbox({
  items,
  userId,
}: {
  items: CaptureRow[];
  userId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const refresh = useCallback(() => router.refresh(), [router]);
  useTableChanges(["captures"], userId, refresh);

  if (items.length === 0)
    return (
      <Panel>
        <p className="py-6 text-center text-sm text-muted-foreground">
          표시할 메모가 없어요. 위 입력창에 메모나 링크를 저장해 보세요.
        </p>
      </Panel>
    );
  return (
    <ul className={cn("space-y-2", pending && "opacity-70")}>
      {items.map((c) => {
        const t = c.triage as Triage | null;
        const frozen =
          c.status === "resolving" && triageSchema.safeParse(c.triage).success;
        const closed = ["resolved", "dismissed"].includes(c.status);
        const ref = c.resolved_ref as { type?: string; id?: string } | null;
        const linkedHref =
          ref?.type === "calendar_event"
            ? `/calendar?event=${ref.id}`
            : ref?.type === "memory"
              ? "/memory"
              : ref?.type === "card"
                ? `/tasks?card=${ref.id}`
                : null;
        return (
          <li key={c.id} className="rounded-lg border bg-card p-3 text-sm">
            <Link
              href={`/capture/${c.id}`}
              className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] hover:underline"
            >
              {c.raw_text}
            </Link>
            {c.url && (
              <a
                href={c.url}
                target="_blank"
                rel="noopener"
                className="block truncate text-xs text-muted-foreground underline"
              >
                {c.url}
              </a>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {closed ? (
                <>
                  <Badge variant="secondary">
                    {c.status === "resolved" ? "처리 완료" : "무시함"}
                  </Badge>
                  {t && (
                    <span className="text-xs text-muted-foreground">
                      {TYPE_LABEL[t.type]}
                    </span>
                  )}
                  {linkedHref && (
                    <Link href={linkedHref} className="text-xs underline">
                      연결된 항목 열기
                    </Link>
                  )}
                </>
              ) : t ? (
                <>
                  <Badge variant="secondary">{TYPE_LABEL[t.type]}</Badge>
                  <span
                    className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
                    title={t.reason}
                  >
                    {proposalText(t)}
                  </span>
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        try {
                          const r = await resolveCaptureAction(c.id);
                          toast.success(
                            r.changed
                              ? `${TYPE_LABEL[r.type]}로 확정했어요`
                              : "이미 처리한 메모예요",
                          );
                        } catch (e) {
                          toast.error(
                            e instanceof Error
                              ? e.message
                              : "확정하지 못했어요. 다시 시도해 주세요",
                          );
                        }
                        refresh();
                      })
                    }
                  >
                    <Check className="size-4" />{" "}
                    {c.status === "resolving" ? "다시 확정" : "확정"}
                  </Button>
                </>
              ) : (
                <span className="flex-1 text-xs text-muted-foreground">
                  저장됨 · AI 분류 대기. 직접 정리할 수도 있어요.
                </span>
              )}
              {!closed && !c.resolved_ref && (
                <CaptureReview capture={c} onDone={refresh} />
              )}
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={
                  pending || closed || frozen || Boolean(c.resolved_ref)
                }
                aria-label="다시 분류"
                onClick={() =>
                  start(async () => {
                    try {
                      await retriageAction(c.id);
                      refresh();
                    } catch (e) {
                      toast.error(
                        e instanceof Error
                          ? e.message
                          : "다시 분류하지 못했어요",
                      );
                    }
                  })
                }
              >
                <RefreshCw className="size-4" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={pending || closed || frozen}
                aria-label="무시"
                onClick={() =>
                  start(async () => {
                    try {
                      const result = await dismissCaptureAction(c.id);
                      if (!result.changed)
                        toast.info(result.reason ?? "변경된 내용이 없어요");
                      refresh();
                    } catch (e) {
                      toast.error(
                        e instanceof Error ? e.message : "무시하지 못했어요",
                      );
                    }
                  })
                }
              >
                <X className="size-4" />
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {c.origin === "voice"
                ? "음성"
                : c.origin === "share"
                  ? "공유"
                  : "입력"}{" "}
              · {fmtDateTime(c.created_at, DEFAULT_TZ)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
