"use client";
import { Archive, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsDesktop } from "@/core/ui/useMediaQuery";
import { PRIORITY_LABEL } from "../format";
import type { CardRow, ColumnRow } from "../repository";
import type { UpdateCardInput } from "../schema";

interface Props {
  card: CardRow | null;
  columns: ColumnRow[];
  onClose: () => void;
  onSave: (id: string, patch: UpdateCardInput) => Promise<void>;
  onMove: (id: string, columnId: string) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function toLocalInput(iso: string | null, hasTime: boolean): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return hasTime ? `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}` : date;
}

export function CardSheet(props: Props) {
  const isDesktop = useIsDesktop();
  const { card, onClose } = props;
  const open = card !== null;
  const body = card ? <CardForm key={card.id} {...props} card={card} /> : null;
  if (isDesktop) {
    return (
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-[420px] overflow-y-auto sm:max-w-[420px]">
          <SheetHeader>
            <SheetTitle className="sr-only">카드 상세</SheetTitle>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader className="sr-only">
          <DrawerTitle>카드 상세</DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {body}
        </div>
      </DrawerContent>
    </Drawer>
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
}: Props & { card: CardRow }) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description_md);
  const [priority, setPriority] = useState(card.priority);
  const [hasTime, setHasTime] = useState(card.due_has_time);
  const [due, setDue] = useState(toLocalInput(card.due_at, card.due_has_time));
  const [labels, setLabels] = useState(card.labels.join(", "));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setDirty(true);
    };

  async function save() {
    if (!dirty) return;
    setSaving(true);
    try {
      let dueAt: string | null = null;
      if (due) {
        const d = hasTime ? new Date(due) : new Date(`${due}T23:59:00`);
        dueAt = d.toISOString();
      }
      await onSave(card.id, {
        title: title.trim() || card.title,
        description,
        priority,
        dueAt,
        dueHasTime: hasTime,
        labels: labels
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  const field =
    "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/50";
  return (
    <div className="space-y-4 pt-2">
      <input
        value={title}
        onChange={(e) => edit(setTitle)(e.target.value)}
        onBlur={save}
        className={`${field} text-base font-medium`}
        aria-label="제목"
      />
      <div className="grid grid-cols-2 gap-3 text-sm">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">컬럼</span>
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
        <span>
          {saving ? "저장 중…" : dirty ? "포커스를 옮기면 저장돼요" : "저장됨"}
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void onArchive(card.id).then(onClose)}
          >
            <Archive className="size-4" /> 보관
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => {
              if (confirm("이 카드를 삭제할까요? 되돌릴 수 없어요."))
                void onDelete(card.id).then(onClose);
            }}
          >
            <Trash2 className="size-4" /> 삭제
          </Button>
        </div>
      </div>
    </div>
  );
}
