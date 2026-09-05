"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { fmtDateTime, localYmd } from "@/core/utils/date";
import { planCardsAction } from "@/modules/tasks/actions";
import { ScheduleTask } from "@/modules/tasks/ui/ScheduleTask";
import type { TodayPlanData } from "../today-plan";

export function TodayPlan({ data }: { data: TodayPlanData }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  function save() {
    startTransition(async () => {
      try {
        const items = data.outcomes
          .filter((c) => selected.includes(c.id))
          .map((c) => ({ id: c.id, expectedVersion: c.version }));
        const result = await planCardsAction(items, data.today);
        setMessage(
          result.remaining.length
            ? `${result.completed}개 반영했어요. 변경된 ${result.remaining.length}개는 다시 확인해 주세요.`
            : `${result.completed}개를 오늘 계획에 넣었어요.`,
        );
        setSelected([]);
        router.refresh();
      } catch {
        setMessage("계획을 저장하지 못했어요. 다시 확인해 주세요.");
      }
    });
  }
  return (
    <section
      aria-label="오늘 먼저 끝낼 일"
      className="mt-4 space-y-3 border-t pt-3"
    >
      <div>
        <h3 className="text-sm font-medium">오늘 먼저 끝낼 일</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {data.availableMinutes === null
            ? "캘린더 최신 상태를 확인하지 못해 남은 시간을 확정할 수 없어요."
            : `고정 일정과 잡아 둔 시간을 빼면 ${Math.floor(data.availableMinutes / 60)}시간 ${data.availableMinutes % 60}분 남아요.`}
          {` 근무시간 ${data.workStart}–${data.workEnd}시 기준이에요.`}
        </p>
        {data.availableMinutes === null && (
          <Link href="/settings" className="text-xs underline">
            캘린더 연결·선택 확인
          </Link>
        )}
      </div>
      {data.outcomes.length ? (
        <ul className="divide-y">
          {data.outcomes.map((card) => (
            <li key={card.id} className="py-2">
              <div className="flex items-start gap-2">
                {card.planDate !== data.today && (
                  <input
                    type="checkbox"
                    aria-label={`${card.title} 오늘 계획에 선택`}
                    className="mt-1 size-4"
                    checked={selected.includes(card.id)}
                    disabled={busy}
                    onChange={(e) =>
                      setSelected((ids) =>
                        e.target.checked
                          ? [...ids, card.id]
                          : ids.filter((id) => id !== card.id),
                      )
                    }
                  />
                )}
                <div className="min-w-0 flex-1">
                  <Link href={card.url} className="text-sm font-medium">
                    {card.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {card.reason} ·{" "}
                    {card.estimateConfirmed
                      ? `잡아 둔 시간 ${card.estimatedMinutes}분`
                      : "소요시간 미정 · 60분으로 임시 계산"}
                    {card.dueAt
                      ? ` · 마감 ${card.dueHasTime ? fmtDateTime(card.dueAt, data.timezone) : localYmd(new Date(card.dueAt), data.timezone)}`
                      : " · 마감 없음"}
                  </p>
                </div>
              </div>
              <div className="mt-2">
                <ScheduleTask
                  id={card.id}
                  linkedId={card.calendarEventId}
                  onChange={() => router.refresh()}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {data.availableMinutes !== null && data.availableMinutes < 60
            ? "남은 시간에는 새 작업보다 하던 일을 마무리하는 편이 좋아요. 짧은 작업은 할 일에서 직접 골라 주세요."
            : "지금 제안할 열린 할 일이 없어요."}
        </p>
      )}
      {selected.length > 0 && (
        <Button size="sm" disabled={busy} onClick={save}>
          선택한 {selected.length}개 오늘 계획에 넣기
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        계획을 바꿔도 마감은 그대로예요. 시간 잡기는 별도로 선택해요.
      </p>
      {message && <output className="block text-xs">{message}</output>}
    </section>
  );
}

export function DayClose({ data }: { data: TodayPlanData }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [kept, setKept] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  function change(card: TodayPlanData["planned"][number], date: string | null) {
    startTransition(async () => {
      try {
        const result = await planCardsAction(
          [{ id: card.id, expectedVersion: card.version }],
          date,
        );
        setMessage(
          result.remaining.length
            ? "할 일이 변경됐어요. 최신 내용을 확인해 주세요."
            : date
              ? "내일 계획으로 옮겼어요. 마감은 그대로예요."
              : "오늘 계획에서 뺐어요. 할 일과 마감은 그대로예요.",
        );
        router.refresh();
      } catch {
        setMessage("계획을 바꾸지 못했어요. 다시 확인해 주세요.");
      }
    });
  }
  return (
    <details>
      <summary className="cursor-pointer text-sm">
        미완료 계획 {data.planned.length}개 정리하기
      </summary>
      <p className="py-2 text-xs text-muted-foreground">
        마감을 바꾸거나 자동 이월하지 않아요. 남길 일만 직접 골라 주세요.
      </p>
      <ul className="divide-y">
        {data.planned.map((card) => (
          <li key={card.id} className="space-y-2 py-2">
            <Link href={card.url} className="text-sm">
              {card.title}
            </Link>
            {card.dueAt && (
              <p className="text-xs text-muted-foreground">
                마감{" "}
                {card.dueHasTime
                  ? fmtDateTime(card.dueAt, data.timezone)
                  : localYmd(new Date(card.dueAt), data.timezone)}
                {localYmd(new Date(card.dueAt), data.timezone) <= data.today
                  ? " · 마감 확인이 필요해요"
                  : ""}
              </p>
            )}
            {kept.includes(card.id) ? (
              <output className="block text-xs">
                오늘 계획에 그대로 뒀어요.
              </output>
            ) : (
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => change(card, data.tomorrow)}
                >
                  내일 계획
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => change(card, null)}
                >
                  계획에서 빼기
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setKept((ids) => [...ids, card.id])}
                >
                  그대로 두기
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {data.planned.length === 0 && (
        <p className="py-2 text-sm text-muted-foreground">
          오늘 남은 계획이 없어요.
        </p>
      )}
      {message && <output className="block py-2 text-xs">{message}</output>}
    </details>
  );
}
