"use client";
import { Archive, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { MutationResult } from "@/core/offline/outbox";
import { FormDialog } from "@/core/ui/FormDialog";
import { dateTimeInZone, tzOffsetMs } from "@/core/utils/date";
import { PRIORITY_LABEL } from "../format";
import { type RepeatRule, repeatRuleSchema } from "../repeat";
import type { CardRow, ColumnRow } from "../repository";
import {
  cardSourceSchema,
  checklistItemSchema,
  type UpdateCardInput,
} from "../schema";
import { ScheduleTask } from "./ScheduleTask";

interface Props {
  card: CardRow | null;
  timezone?: string;
  columns: ColumnRow[];
  onClose: () => void;
  onSave: (
    id: string,
    patch: UpdateCardInput,
  ) => Promise<MutationResult<unknown>>;
  onMove: (id: string, columnId: string) => Promise<MutationResult<unknown>>;
  onArchive: (id: string) => Promise<MutationResult<unknown>>;
  onDelete: (id: string) => Promise<MutationResult<unknown>>;
  closeGuard?: React.RefObject<(() => Promise<boolean>) | null>;
}

function toLocalInput(
  iso: string | null,
  hasTime: boolean,
  timezone: string,
): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() + tzOffsetMs(timezone, d))
    .toISOString()
    .slice(0, hasTime ? 16 : 10);
}

export function CardSheet(props: Props) {
  const { card, onClose } = props;
  const closeGuard = useRef<(() => Promise<boolean>) | null>(null);
  return (
    <FormDialog
      open={card !== null}
      onClose={() => {
        void (closeGuard.current?.() ?? Promise.resolve(true)).then(
          (canClose) => {
            if (canClose) onClose();
          },
        );
      }}
      title="할 일"
    >
      {card ? (
        <CardForm
          key={card.id}
          {...props}
          card={card}
          closeGuard={closeGuard}
        />
      ) : null}
    </FormDialog>
  );
}

function CardForm({
  card,
  columns,
  onSave,
  onMove,
  onArchive,
  onDelete,
  onClose,
  closeGuard,
  timezone = "Asia/Seoul",
}: Props & { card: CardRow }) {
  const source = cardSourceSchema.safeParse(card.source);
  const sourceAt = source.success ? source.data.source_at_ms?.[0] : undefined;
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description_md);
  const [priority, setPriority] = useState(card.priority);
  const [repeatRule, setRepeatRule] = useState<RepeatRule | null>(() =>
    repeatRuleSchema.nullable().catch(null).parse(card.repeat_rule),
  );
  const [planDate, setPlanDate] = useState(card.plan_date ?? "");
  const [hasTime, setHasTime] = useState(card.due_has_time);
  const [due, setDue] = useState(
    toLocalInput(card.due_at, card.due_has_time, timezone),
  );
  const [labels, setLabels] = useState(card.labels.join(", "));
  const [checklist, setChecklist] = useState(() =>
    checklistItemSchema.array().catch([]).parse(card.checklist),
  );
  const [newItem, setNewItem] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const revision = useRef(0);
  const savingRef = useRef(false);
  const [status, setStatus] = useState<"saved" | "queued" | "failed">("saved");
  const [message, setMessage] = useState("");
  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      revision.current++;
      setDirty(true);
    };

  async function save() {
    if (savingRef.current) return false;
    if (!dirty) return status !== "failed";
    savingRef.current = true;
    const version = revision.current;
    setSaving(true);
    try {
      let dueAt: string | null = card.due_at;
      const unchangedDue =
        hasTime === card.due_has_time &&
        due === toLocalInput(card.due_at, card.due_has_time, timezone);
      if (!unchangedDue && !due) dueAt = null;
      if (!unchangedDue && due) {
        dueAt = dateTimeInZone(hasTime ? due : `${due}T23:59`, timezone);
      }
      const result = await onSave(card.id, {
        title: title.trim() || card.title,
        description,
        priority,
        repeatRule,
        planDate: planDate || null,
        dueAt,
        dueHasTime: hasTime,
        labels: labels
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        checklist,
      });
      setStatus(result.status);
      setMessage(result.status === "failed" ? result.message : "");
      if (result.status !== "failed" && revision.current === version)
        setDirty(false);
      return result.status !== "failed" && revision.current === version;
    } catch (e) {
      setStatus("failed");
      setMessage(e instanceof Error ? e.message : "저장하지 못했어요");
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  useEffect(() => {
    if (closeGuard) closeGuard.current = save;
    const preventLoss = (e: BeforeUnloadEvent) => {
      if (dirty || saving) e.preventDefault();
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  });

  const field =
    "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/50";
  return (
    <div className="space-y-3">
      <input
        value={title}
        onChange={(e) => edit(setTitle)(e.target.value)}
        onBlur={save}
        className={`${field} text-base font-medium`}
        aria-label="제목"
      />
      <div className="grid grid-cols-2 gap-3 text-sm">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">상태</span>
          <select
            className={field}
            value={card.column_id}
            onChange={(e) => void onMove(card.id, e.target.value)}
          >
            {columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">우선순위</span>
          <select
            className={field}
            value={priority}
            onChange={(e) => edit(setPriority)(Number(e.target.value))}
            onBlur={save}
          >
            {[0, 1, 2, 3].map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">마감</span>
          <input
            type={hasTime ? "datetime-local" : "date"}
            className={field}
            value={due}
            onChange={(e) => edit(setDue)(e.target.value)}
            onBlur={save}
          />
        </label>
        <label className="flex items-end gap-2 pb-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={hasTime}
            onChange={(e) => {
              edit(setHasTime)(e.target.checked);
              setDue((d) =>
                e.target.checked
                  ? d
                    ? `${d.slice(0, 10)}T09:00`
                    : ""
                  : d.slice(0, 10),
              );
            }}
            onBlur={save}
          />
          시각 지정
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <span className="text-xs text-muted-foreground">
          하기로 한 날 · 마감은 그대로 유지돼요
        </span>
        <input
          type="date"
          aria-label="하기로 한 날"
          className={field}
          value={planDate}
          onChange={(e) => edit(setPlanDate)(e.target.value)}
          onBlur={save}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-xs text-muted-foreground">
          라벨 (쉼표로 구분)
        </span>
        <input
          value={labels}
          onChange={(e) => edit(setLabels)(e.target.value)}
          onBlur={save}
          className={field}
          placeholder="예: 업무, 긴급"
        />
      </label>
      {!card.id.startsWith("temp-") && (
        <ScheduleTask id={card.id} linkedId={card.calendar_event_id} />
      )}
      <section className="space-y-1" aria-label="체크리스트">
        <p className="text-xs text-muted-foreground">
          체크리스트 · {checklist.filter((item) => item.done).length}/
          {checklist.length}
        </p>
        {checklist.map((item) => (
          <div key={item.id} className="flex min-h-10 items-center gap-2">
            <input
              type="checkbox"
              aria-label={`${item.text} 완료`}
              checked={item.done}
              onChange={(e) =>
                edit(setChecklist)(
                  checklist.map((entry) =>
                    entry.id === item.id
                      ? { ...entry, done: e.target.checked }
                      : entry,
                  ),
                )
              }
              onBlur={save}
            />
            <span
              className={`flex-1 text-sm ${item.done ? "line-through text-muted-foreground" : ""}`}
            >
              {item.text}
            </span>
            <button
              type="button"
              className="min-h-10 px-2 text-xs text-muted-foreground"
              aria-label={`${item.text} 삭제`}
              onClick={() =>
                edit(setChecklist)(
                  checklist.filter((entry) => entry.id !== item.id),
                )
              }
            >
              삭제
            </button>
          </div>
        ))}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newItem.trim()) return;
            edit(setChecklist)([
              ...checklist,
              { id: crypto.randomUUID(), text: newItem.trim(), done: false },
            ]);
            setNewItem("");
          }}
        >
          <input
            className={field}
            aria-label="체크리스트 항목"
            placeholder="작은 단계 추가"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
          />
          <Button type="submit" variant="outline" size="sm">
            추가
          </Button>
        </form>
      </section>
      <details className="rounded-md border p-3 text-sm">
        <summary className="cursor-pointer">
          반복 {repeatRule ? "사용 중" : "설정"}
        </summary>
        <div className="mt-2 space-y-2">
          <select
            aria-label="반복 방식"
            className="w-full rounded-md border bg-background px-2 py-2"
            value={repeatRule?.kind ?? "none"}
            disabled={Boolean(card.completed_at)}
            onChange={(e) =>
              edit(setRepeatRule)(
                e.target.value === "none"
                  ? null
                  : {
                      kind: e.target.value as RepeatRule["kind"],
                      interval:
                        e.target.value === "weekly"
                          ? 7
                          : (repeatRule?.interval ?? 7),
                      weekday: repeatRule?.weekday ?? 1,
                    },
              )
            }
          >
            <option value="none">반복 안 함</option>
            <option value="weekly">매주 정해진 요일</option>
            <option value="after_completion">완료한 날부터 N일 뒤</option>
          </select>
          {repeatRule?.kind === "weekly" && (
            <select
              aria-label="반복 요일"
              className="rounded-md border bg-background px-2 py-2"
              value={repeatRule.weekday}
              onChange={(e) =>
                edit(setRepeatRule)({
                  ...repeatRule,
                  weekday: Number(e.target.value),
                })
              }
            >
              {["일", "월", "화", "수", "목", "금", "토"].map((day, i) => (
                <option key={day} value={i}>
                  {day}요일
                </option>
              ))}
            </select>
          )}
          {repeatRule?.kind === "after_completion" && (
            <label className="flex items-center gap-2">
              <input
                aria-label="완료 후 반복 간격"
                type="number"
                min={1}
                max={365}
                className="w-20 rounded-md border bg-background px-2 py-2"
                value={repeatRule.interval}
                onChange={(e) =>
                  edit(setRepeatRule)({
                    ...repeatRule,
                    interval: Number(e.target.value),
                  })
                }
              />
              일 뒤
            </label>
          )}
          <p className="text-xs text-muted-foreground">
            완료하면 다음 할 일 하나가 생겨요. 지난 회차는 완료 기록에 남고,
            완료를 취소해도 이미 생긴 다음 회차는 유지돼요.
          </p>
          {card.repeat_parent_id && (
            <Link
              className="block py-1 text-xs underline"
              href={`/tasks/${card.board_id}?card=${card.repeat_parent_id}`}
            >
              이전 회차 열기
            </Link>
          )}
        </div>
      </details>
      {(card.meeting_id || card.calendar_event_id) && (
        <div className="flex gap-3 text-xs">
          {card.meeting_id && (
            <Link
              className="underline underline-offset-2"
              href={`/meetings/${card.meeting_id}${sourceAt === undefined ? "" : `?at=${sourceAt}`}`}
            >
              원본 회의 열기
            </Link>
          )}
          {card.calendar_event_id && (
            <Link
              className="underline underline-offset-2"
              href={`/calendar?event=${card.calendar_event_id}`}
            >
              연결된 일정 열기
            </Link>
          )}
        </div>
      )}
      <label className="block space-y-1 text-sm">
        <span className="text-xs text-muted-foreground">설명</span>
        <textarea
          value={description}
          onChange={(e) => edit(setDescription)(e.target.value)}
          onBlur={save}
          rows={5}
          className={field}
        />
      </label>
      <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
        <output className="min-w-0">
          {saving
            ? "저장 중…"
            : status === "failed"
              ? `저장 실패: ${message}`
              : dirty
                ? "수정한 내용이 있어요"
                : status === "queued"
                  ? "기기에 저장 · 전송 대기"
                  : "저장됨"}
          {dirty && (
            <Button
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => void save()}
            >
              {status === "failed" ? "다시 저장" : "저장"}
            </Button>
          )}
        </output>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              void onArchive(card.id).then((r) => {
                if (r.status !== "failed") onClose();
              })
            }
          >
            <Archive className="size-4" />{" "}
            {card.archived_at ? "보관함에서 복구" : "보관"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => {
              if (confirm("이 카드를 삭제할까요? 되돌릴 수 없어요."))
                void onDelete(card.id).then((r) => {
                  if (r.status !== "failed") onClose();
                });
            }}
          >
            <Trash2 className="size-4" /> 삭제
          </Button>
        </div>
      </div>
    </div>
  );
}
