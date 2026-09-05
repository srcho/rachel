"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/core/ui/FormDialog";
import { fmtDateTime, localYmd } from "@/core/utils/date";
import { createCardsFromMeetingAction } from "../review-actions";
import { meetingActionKey, meetingDue } from "../review-items";
import type { MeetingSummary } from "../schema";

interface Props {
  open: boolean;
  onClose: () => void;
  meetingId: string;
  startedAt: string;
  timezone: string;
  items: MeetingSummary["actionItems"];
  createdKeys: string[];
  followups: MeetingSummary["followups"];
  onDone: () => void;
}

export function ReviewSheet(props: Props) {
  return (
    <FormDialog
      open={props.open}
      onClose={props.onClose}
      title="후속 할 일 검토"
    >
      {props.open && <ReviewForm {...props} />}
    </FormDialog>
  );
}

function ReviewForm({
  onClose,
  meetingId,
  startedAt,
  timezone,
  items,
  createdKeys,
  onDone,
}: Props) {
  const [rows, setRows] = useState(() =>
    items.map((a) => {
      const parsed = meetingDue(a.due, startedAt, timezone);
      return {
        key: meetingActionKey(meetingId, a),
        title: a.title,
        owner: a.owner ?? "",
        kind: (/^(나|저|본인|me)$/i.test(a.owner?.trim() ?? "")
          ? "task"
          : a.owner
            ? "waiting"
            : "reference") as "task" | "waiting" | "event" | "reference",
        due: parsed ? localYmd(new Date(parsed.dueAt), timezone) : "",
        dueAt: parsed?.dueAt ?? null,
        hasTime: parsed?.hasTime ?? false,
        dateChanged: false,
        selected:
          /^(나|저|본인|me)$/i.test(a.owner?.trim() ?? "") &&
          !createdKeys.includes(meetingActionKey(meetingId, a)),
      };
    }),
  );
  const [created, setCreated] = useState(() => new Set(createdKeys));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  useEffect(() => setCreated(new Set(createdKeys)), [createdKeys]);
  const patch = (i: number, value: Partial<(typeof rows)[number]>) =>
    setRows((s) => s.map((r, j) => (j === i ? { ...r, ...value } : r)));
  const chosen = rows.filter((r) => r.selected && !created.has(r.key));
  async function create() {
    if (!chosen.length || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await createCardsFromMeetingAction(
        meetingId,
        chosen.map((r) => ({
          key: r.key,
          kind: r.kind,
          owner: r.owner,
          title: r.title,
          dueAt: r.dateChanged
            ? (meetingDue(r.due, startedAt, timezone)?.dueAt ?? null)
            : r.dueAt,
          dueHasTime: r.dateChanged ? false : r.hasTime,
          description: r.owner ? `담당: ${r.owner}` : "담당 미정",
        })),
      );
      setCreated((s) => new Set([...s, ...result.map((r) => r.key)]));
      toast.success(`후속 할 일 ${result.length}개를 확인했어요`);
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "추가하지 못했어요");
      onDone(); // Partial successes are shown as already added after refresh.
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const field = "w-full rounded-md border bg-background px-2.5 py-2 text-sm";
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">
        {fmtDateTime(startedAt, timezone, "date")} 회의 기준 · 내 담당 항목만
        먼저 선택했어요.
      </p>
      <ul className="divide-y">
        {rows.map((r, i) => (
          <li key={r.key} className="space-y-2 py-3 first:pt-0">
            <label className="flex min-h-9 items-center gap-2">
              <input
                type="checkbox"
                disabled={busy || created.has(r.key)}
                checked={r.selected && !created.has(r.key)}
                onChange={(e) => patch(i, { selected: e.target.checked })}
              />
              <span className="flex-1">
                {created.has(r.key)
                  ? "이미 추가됨"
                  : r.owner
                    ? /^(나|저|본인|me)$/i.test(r.owner.trim())
                      ? "내 할 일"
                      : `${r.owner}에게 확인할 일`
                    : "담당 미정 · 확인 후 선택"}
              </span>
            </label>
            <input
              className={field}
              value={r.title}
              disabled={busy || created.has(r.key)}
              onChange={(e) => patch(i, { title: e.target.value })}
              aria-label={`후속 할 일 ${i + 1} 제목`}
            />
            <label className="flex items-center gap-2 text-xs">
              <span>분류</span>
              <select
                className={field}
                aria-label={`후속 항목 ${i + 1} 분류`}
                value={r.kind}
                disabled={busy || created.has(r.key)}
                onChange={(e) =>
                  patch(i, { kind: e.target.value as typeof r.kind })
                }
              >
                <option value="task">내 할 일</option>
                <option value="waiting">다른 사람에게 확인</option>
                <option value="event">일정</option>
                <option value="reference">참고로 보관</option>
              </select>
            </label>
            {r.kind === "event" && (
              <p className="text-xs text-muted-foreground">
                시각이 없으면 종일 일정, 시각이 있으면 1시간 일정으로 추가해요.
                확정 후 캘린더에서 길이를 조정할 수 있어요.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">담당</span>
                <input
                  className={field}
                  value={r.owner}
                  disabled={busy || created.has(r.key)}
                  placeholder="미정"
                  onChange={(e) => patch(i, { owner: e.target.value })}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">기한</span>
                <input
                  className={field}
                  type="date"
                  value={r.due}
                  disabled={busy || created.has(r.key)}
                  onChange={(e) =>
                    patch(i, { due: e.target.value, dateChanged: true })
                  }
                />
              </label>
            </div>
            {items[i]?.due && (
              <p className="text-xs text-muted-foreground">
                원문: {items[i]?.due}
                {!r.due
                  ? " · 기한을 확인해 주세요"
                  : r.hasTime && !r.dateChanged && r.dueAt
                    ? ` · ${fmtDateTime(r.dueAt, timezone)}`
                    : ""}
              </p>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error} · 다시 시도해도 같은 할 일은 중복되지 않아요.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
          닫기
        </Button>
        <Button
          size="sm"
          onClick={create}
          disabled={
            busy ||
            !chosen.length ||
            chosen.some(
              (r) => !r.title.trim() || (r.kind === "event" && !r.due),
            )
          }
        >
          {busy ? "추가 중…" : `${chosen.length}개 추가`}
        </Button>
      </div>
    </div>
  );
}
