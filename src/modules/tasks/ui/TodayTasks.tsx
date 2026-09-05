"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { completeCardAction, updateCardAction } from "../actions";
import { DUE_TONE, formatDue } from "../format";
import type { CardRow } from "../repository";

export function TodayTasks({
  planned,
  due,
  overdue,
  suggestions,
  today,
  tomorrow,
}: {
  planned: CardRow[];
  due: CardRow[];
  overdue: CardRow[];
  suggestions: CardRow[];
  today: string;
  tomorrow: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function run(id: string, action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(id);
    try {
      await action();
      router.refresh();
    } catch {
      toast.error("저장하지 못했어요. 변경할 항목은 그대로 남아 있어요.");
    } finally {
      setBusy(null);
    }
  }
  function row(card: CardRow, suggestion = false) {
    const date = formatDue(card);
    return (
      <li
        key={card.id}
        className="flex min-h-11 items-center gap-1 border-b last:border-0"
      >
        {!suggestion && (
          <button
            type="button"
            className="min-h-11 w-9 shrink-0 text-lg"
            aria-label={`${card.title} 완료`}
            disabled={!!busy}
            onClick={() => void run(card.id, () => completeCardAction(card.id))}
          >
            □
          </button>
        )}
        <Link
          className="min-w-0 flex-1 py-2 text-sm"
          href={`/tasks/${card.board_id}?card=${card.id}`}
        >
          <span className="block truncate">{card.title}</span>
          {date && (
            <span className={`text-xs ${DUE_TONE[date.tone]}`}>
              {date.text} 마감
            </span>
          )}
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11 shrink-0 text-xs"
          disabled={!!busy}
          onClick={() =>
            void run(card.id, () =>
              updateCardAction(card.id, {
                planDate: suggestion ? today : tomorrow,
              }),
            )
          }
        >
          {busy === card.id
            ? "저장 중"
            : suggestion
              ? "오늘 하기"
              : "내일 하기"}
        </Button>
      </li>
    );
  }
  const scheduledIds = new Set(planned.map((c) => c.id));
  const deadline = due.filter((c) => !scheduledIds.has(c.id));
  return (
    <div className="space-y-3">
      <section aria-label="오늘 하기로 한 일">
        <p className="text-xs font-medium text-muted-foreground">
          오늘 하기로 한 일 · {planned.length}
        </p>
        {planned.length ? (
          <ul>{planned.map((c) => row(c))}</ul>
        ) : (
          <p className="py-2 text-sm text-muted-foreground">
            핵심 3개부터 골라 보세요. 개수 제한은 없어요.
          </p>
        )}
      </section>
      {deadline.length > 0 && (
        <section aria-label="오늘 마감">
          <p className="text-xs text-muted-foreground">
            오늘 마감 · {deadline.length}
          </p>
          <ul>{deadline.map((c) => row(c))}</ul>
        </section>
      )}
      {planned.length === 0 && suggestions.length > 0 && (
        <details open>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            오늘 할 일 추천 · 우선순위와 마감 기준
          </summary>
          <ul>{suggestions.map((c) => row(c, true))}</ul>
        </details>
      )}
      {overdue.length > 0 && (
        <details>
          <summary className="cursor-pointer py-1 text-xs text-destructive">
            지난 마감 {overdue.length}개 · 다시 계획하기
          </summary>
          <p className="py-1 text-xs text-muted-foreground">
            하기로 한 날을 옮겨도 원래 마감은 유지돼요.
          </p>
          <ul>{overdue.map((c) => row(c, true))}</ul>
        </details>
      )}
      {planned.length === 0 && due.length === 0 && suggestions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          남아 있는 할 일이 없어요.
        </p>
      )}
    </div>
  );
}
