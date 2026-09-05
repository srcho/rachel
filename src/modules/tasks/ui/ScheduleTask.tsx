"use client";
import Link from "next/link";
import { startTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { fmtDateTime } from "@/core/utils/date";
import {
  rescheduleTaskAction,
  scheduleTaskAction,
  taskSlotsAction,
  unscheduleTaskAction,
} from "../actions";
export function ScheduleTask({
  id,
  linkedId,
  onChange,
}: {
  id: string;
  linkedId: string | null;
  onChange?: () => void;
}) {
  const [duration, setDuration] = useState<30 | 60 | 90>(60);
  const [slots, setSlots] = useState<Array<{
    startAt: string;
    endAt: string;
  }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [eventId, setEventId] = useState(linkedId);
  const [timezone, setTimezone] = useState("Asia/Seoul");
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "시간을 잡지 못했어요");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-md border p-2 text-sm">
      <summary className="cursor-pointer">
        {eventId ? "잡아 둔 시간 변경" : "시간 잡기"}
      </summary>
      {eventId && (
        <div className="flex items-center gap-3 py-2">
          <Link
            className="text-xs underline"
            href={`/calendar?event=${eventId}`}
          >
            잡아 둔 시간 열기
          </Link>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              startTransition(() => {
                void run(async () => {
                  await unscheduleTaskAction(id);
                  setEventId(null);
                  setSlots(null);
                  onChange?.();
                });
              })
            }
          >
            시간 취소
          </Button>
        </div>
      )}
      <p className="py-2 text-xs text-muted-foreground">
        일할 시간을 일정에 추가해요. 마감과 Google Tasks 날짜는 그대로예요.
      </p>
      <div className="flex items-center gap-1">
        {([30, 60, 90] as const).map((n) => (
          <Button
            key={n}
            type="button"
            size="sm"
            variant={n === duration ? "secondary" : "ghost"}
            disabled={busy}
            onClick={() => {
              setDuration(n);
              setSlots(null);
            }}
          >
            {n}분
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await taskSlotsAction(duration);
              setSlots(result.slots);
              setTimezone(result.timezone);
            })
          }
        >
          빈 시간 찾기
        </Button>
      </div>
      {slots && (
        <ul className="mt-2 divide-y">
          {slots.map((slot) => (
            <li key={slot.startAt}>
              <button
                type="button"
                disabled={busy}
                className="min-h-11 w-full text-left text-sm"
                onClick={() =>
                  void run(async () => {
                    const event = await (eventId
                      ? rescheduleTaskAction
                      : scheduleTaskAction)({
                      cardId: id,
                      startAt: slot.startAt,
                      durationMinutes: duration,
                    });
                    setEventId(event.id);
                    setSlots(null);
                    onChange?.();
                  })
                }
              >
                {fmtDateTime(slot.startAt, timezone)} · {duration}분에 잡기
              </button>
            </li>
          ))}
        </ul>
      )}
      {slots?.length === 0 && (
        <p className="py-2 text-xs text-muted-foreground">
          이번 주 근무시간에는 맞는 시간이 없어요.
        </p>
      )}
      {error && (
        <p role="alert" className="py-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </details>
  );
}
