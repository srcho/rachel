"use client";
import { Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/core/ui/FormDialog";
import { dateTimeInZone } from "@/core/utils/date";
import { MeetingPreparation } from "@/modules/meetings/ui/MeetingPreparation";
import {
  createEventAction,
  deleteEventAction,
  updateEventAction,
} from "../actions";
import type { CalendarInfo } from "./CalendarScreen";
import { SyncStatus } from "./SyncStatus";

export interface EventDraft {
  id: string | null;
  title: string;
  startAt: string; // datetime-local 또는 date
  endAt: string;
  allDay: boolean;
  isBusy?: boolean;
  location: string;
  description: string;
  calendarId: string;
  etagPending?: boolean;
  syncStatus?: string;
  recurring?: boolean;
}

export function EventSheet({
  draft,
  calendars,
  timezone = "Asia/Seoul",
  onClose,
  onSaved,
}: {
  draft: EventDraft | null;
  calendars: CalendarInfo[];
  timezone?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <FormDialog
      open={draft !== null}
      onClose={onClose}
      title={draft?.id ? "일정" : "새 일정"}
    >
      {draft ? (
        <EventForm
          key={draft.id ?? "new"}
          draft={draft}
          calendars={calendars}
          timezone={timezone}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </FormDialog>
  );
}

const field =
  "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/50";

function toIso(local: string, allDay: boolean, timezone: string): string {
  return dateTimeInZone(allDay ? `${local}T00:00` : local, timezone);
}

function EventForm({
  draft,
  calendars,
  timezone = "Asia/Seoul",
  onClose,
  onSaved,
}: {
  draft: EventDraft;
  calendars: CalendarInfo[];
  timezone?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState(draft);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [creationKey] = useState(() => crypto.randomUUID());
  const readOnly =
    !!d.id && !calendars.some((c) => c.id === d.calendarId && c.writable);
  const writable = calendars.filter((c) => c.writable);
  const set = <K extends keyof EventDraft>(k: K, v: EventDraft[K]) =>
    setD((p) => ({ ...p, [k]: v }));

  async function save() {
    if (saving.current || readOnly || d.syncStatus === "conflict") return;
    if (!d.title.trim()) return toast.error("제목을 입력해 주세요");
    saving.current = true;
    setBusy(true);
    try {
      // 종일 일정은 Google 규약대로 종료일 = 다음날 자정(exclusive)
      const startAt = toIso(d.startAt, d.allDay, timezone);
      let endAt = toIso(d.endAt, d.allDay, timezone);
      if (d.allDay) {
        const e = new Date(endAt);
        e.setDate(e.getDate() + 1);
        endAt = e.toISOString();
      }
      const payload = {
        title: d.title.trim(),
        startAt,
        endAt,
        allDay: d.allDay,
        isBusy: d.isBusy ?? true,
        // 비운 값은 null 로 보내야 지워진다(undefined 는 "변경 없음")
        location: d.location.trim() || null,
        description: d.description.trim() || null,
      };
      if (d.id) await updateEventAction(d.id, payload);
      else
        await createEventAction({
          ...payload,
          creationKey,
          calendarId: d.calendarId || undefined,
        });
      toast.success("레이첼에 저장했어요 · Google 반영 대기");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장 실패");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !d.id ||
      !confirm("이 일정을 삭제할까요? Google 캘린더에서도 지워져요.")
    )
      return;
    setBusy(true);
    try {
      await deleteEventAction(d.id);
      toast.success("삭제했어요");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {readOnly && (
        <p className="text-xs text-muted-foreground">
          읽기 전용 일정이에요. 내용을 확인할 수 있어요.
        </p>
      )}
      {d.recurring && (
        <p className="text-xs text-muted-foreground">
          반복 일정 중 이번 일정만 변경돼요.
        </p>
      )}
      {d.id && (
        <SyncStatus
          id={d.id}
          status={d.syncStatus ?? "pending_push"}
          timezone={timezone}
          onChanged={() => {
            onSaved();
            onClose();
          }}
        />
      )}
      <fieldset
        disabled={readOnly || busy || d.syncStatus === "conflict"}
        className="space-y-3"
      >
        <input
          value={d.title}
          onChange={(e) => set("title", e.target.value)}
          className={`${field} text-base font-medium`}
          placeholder="제목"
          aria-label="제목"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={d.allDay}
            onChange={(e) => {
              const allDay = e.target.checked;
              setD((p) => ({
                ...p,
                allDay,
                startAt: allDay
                  ? p.startAt.slice(0, 10)
                  : `${p.startAt.slice(0, 10)}T09:00`,
                endAt: allDay
                  ? p.endAt.slice(0, 10)
                  : `${p.endAt.slice(0, 10)}T10:00`,
              }));
            }}
          />
          종일
        </label>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={d.isBusy ?? true}
            onChange={(e) => set("isBusy", e.target.checked)}
          />
          이 시간에는 다른 일을 잡지 않기
        </label>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">시작</span>
            <input
              type={d.allDay ? "date" : "datetime-local"}
              value={d.startAt}
              onChange={(e) => {
                const next = e.target.value;
                const duration =
                  new Date(d.endAt).getTime() - new Date(d.startAt).getTime();
                if (next && Number.isFinite(duration) && duration >= 0) {
                  const shifted = new Date(new Date(next).getTime() + duration);
                  const local = new Date(
                    shifted.getTime() - shifted.getTimezoneOffset() * 60_000,
                  ).toISOString();
                  setD((p) => ({
                    ...p,
                    startAt: next,
                    endAt: local.slice(0, d.allDay ? 10 : 16),
                  }));
                } else set("startAt", next);
              }}
              className={field}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">종료</span>
            <input
              type={d.allDay ? "date" : "datetime-local"}
              value={d.endAt}
              onChange={(e) => set("endAt", e.target.value)}
              className={field}
            />
          </label>
        </div>
        {!d.id && writable.length > 1 && (
          <label className="block space-y-1 text-sm">
            <span className="text-xs text-muted-foreground">캘린더</span>
            <select
              className={field}
              value={d.calendarId}
              onChange={(e) => set("calendarId", e.target.value)}
            >
              {writable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <input
          value={d.location}
          onChange={(e) => set("location", e.target.value)}
          className={field}
          placeholder="장소"
          aria-label="장소"
        />
        <textarea
          value={d.description}
          onChange={(e) => set("description", e.target.value)}
          className={field}
          rows={4}
          placeholder="설명"
          aria-label="설명"
        />
      </fieldset>
      {d.id && <MeetingPreparation title={d.title} eventId={d.id} />}
      {!readOnly && (
        <div className="flex items-center justify-between pt-1">
          {d.id ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={remove}
              disabled={busy}
            >
              <Trash2 className="size-4" /> 삭제
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="submit"
            size="sm"
            disabled={busy || d.syncStatus === "conflict"}
          >
            {busy ? "저장 중…" : "저장"}
          </Button>
        </div>
      )}
    </form>
  );
}
