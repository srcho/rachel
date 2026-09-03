"use client";
import { Check, RefreshCw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTableChanges } from "@/core/realtime/useTableChanges";
import { cn } from "@/lib/utils";
import {
  dismissCaptureAction,
  resolveCaptureAction,
  retriageAction,
} from "../actions";
import type { Triage } from "../schema";
import type { CaptureRow } from "../service";

const TYPE_LABEL: Record<string, string> = {
  task: "할 일",
  event: "일정",
  memory: "기억",
  note: "메모",
};

function proposalText(t: Triage): string {
  if (t.type === "task" && t.task)
    return `${t.task.title}${t.task.due ? ` · ${new Date(t.task.due).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""} · P${t.task.priority}`;
  if (t.type === "event" && t.event)
    return `${t.event.title} · ${new Date(t.event.startAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
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
      <p className="py-10 text-center text-sm text-muted-foreground">
        인박스가 비어 있어요. Today 입력창이나 공유 시트, 레이첼 버튼 길게
        누르기로 던져 보세요.
      </p>
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
                  <span className="rounded bg-muted px-1.5 py-px text-[11px]">
                    {TYPE_LABEL[t.type]}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
                    title={t.reason}
                  >
                    {proposalText(t)}
                  </span>
                  <Button
                    size="sm"
                    onClick={() =>
                      start(async () => {
                        const r = await resolveCaptureAction(c.id);
                        toast.success(`${TYPE_LABEL[r.type]}로 만들었어요`);
                      })
                    }
                  >
                    <Check className="size-4" /> 확정
                  </Button>
                </>
              ) : (
                <span className="flex-1 text-xs text-muted-foreground">
                  레이첼이 분류하는 중…
                </span>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label="다시 분류"
                onClick={() => start(() => retriageAction(c.id))}
              >
                <RefreshCw className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
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
              ·{" "}
              {new Date(c.created_at).toLocaleString("ko-KR", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
