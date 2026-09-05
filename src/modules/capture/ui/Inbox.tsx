"use client";
import { Check, RefreshCw, X } from "lucide-react";
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
import type { Triage } from "../schema";
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
    return `${t.task.title}${t.task.due ? ` · ${fmtDateTime(t.task.due, DEFAULT_TZ)}` : ""} · P${t.task.priority}`;
  if (t.type === "event" && t.event)
    return `${t.event.title} · ${fmtDateTime(t.event.startAt, DEFAULT_TZ)}`;
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
          수집함이 비어 있어요. 오늘 화면에서 빠른 메모를 남길 수 있어요.
        </p>
      </Panel>
    );
  return (
    <ul className={cn("space-y-2", pending && "opacity-70")}>
      {items.map((c) => {
        const t = c.triage as Triage | null;
        return (
          <li key={c.id} className="rounded-lg border bg-card p-3 text-sm">
            <p className="whitespace-pre-wrap">{c.raw_text}</p>
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
              {t ? (
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
                          toast.success(`${TYPE_LABEL[r.type]}로 만들었어요`);
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
                  레이첼이 분류하는 중…
                </span>
              )}
              <CaptureReview capture={c} onDone={refresh} />
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={pending || c.status === "resolving"}
                aria-label="다시 분류"
                onClick={() => start(() => retriageAction(c.id))}
              >
                <RefreshCw className="size-4" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={pending || c.status === "resolving"}
                aria-label="무시"
                onClick={() => start(() => dismissCaptureAction(c.id))}
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
