"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { SuggestionRow } from "./proactive";
import { respondSuggestionAction } from "./proactive-actions";
import type { SuggestionResponse } from "./proactive-schema";

export function ProactiveCards({
  items,
  notices,
}: {
  items: SuggestionRow[];
  notices: string[];
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  function respond(row: SuggestionRow, action: SuggestionResponse["action"]) {
    start(async () => {
      try {
        const result = await respondSuggestionAction({
          id: row.id,
          expectedVersion: row.updated_at,
          action,
          ...(action === "snooze"
            ? { until: new Date(Date.now() + 3600000).toISOString() }
            : {}),
        });
        toast.message(
          result.changed
            ? action === "accept_preference"
              ? "확인한 선호를 적용했어요"
              : "제안 상태를 변경했어요"
            : "이미 처리한 제안이에요",
        );
        router.refresh();
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "제안을 처리하지 못했어요",
        );
      }
    });
  }
  function card(row: SuggestionRow) {
    return (
      <article key={row.id} className="rounded-lg border bg-card p-4">
        <p className="text-sm font-medium">{row.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{row.body}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {row.kind === "preference" ? (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => respond(row, "accept_preference")}
            >
              앞으로 적용
            </Button>
          ) : (
            <Button size="sm" asChild>
              <Link href={row.href}>지금 처리</Link>
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => respond(row, "snooze")}
          >
            1시간 뒤
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              respond(
                row,
                row.kind === "preference" ? "reject_preference" : "dismiss",
              )
            }
          >
            제안 닫기
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => respond(row, "disable_kind")}
          >
            이런 제안 끄기
          </Button>
        </div>
      </article>
    );
  }
  if (!items.length) return null;
  return (
    <section aria-label="확인할 제안" className="space-y-2">
      {items[0] && card(items[0])}
      {items.length > 1 && (
        <details>
          <summary className="cursor-pointer py-2 text-xs text-muted-foreground">
            다른 제안 {items.length - 1}개
          </summary>
          <div className="space-y-2">{items.slice(1).map(card)}</div>
        </details>
      )}
      {notices.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            확인 범위
          </summary>
          {notices.map((notice) => (
            <p key={notice} className="text-xs text-muted-foreground">
              {notice}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
