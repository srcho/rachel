"use client";
import { useState } from "react";
import { toast } from "sonner";
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
import { createCardsFromMeetingAction } from "../review-actions";
import type { MeetingSummary } from "../schema";

interface Props {
  open: boolean;
  onClose: () => void;
  meetingId: string;
  items: MeetingSummary["actionItems"];
  followups: MeetingSummary["followups"];
  onDone: () => void;
}

/** 액션 아이템 체크 → 카드 생성(기본 전체 선택). 기한 표현은 한국어 파서로 시도. */
export function ReviewSheet({
  open,
  onClose,
  meetingId,
  items,
  onDone,
}: Props) {
  const isDesktop = useIsDesktop();
  const [selected, setSelected] = useState<boolean[]>(items.map(() => true));
  const [busy, setBusy] = useState(false);

  async function create() {
    const chosen = items.filter((_, i) => selected[i]);
    if (chosen.length === 0) return onClose();
    setBusy(true);
    try {
      const { parseDueFromTitle } = await import("@/modules/tasks/parse-due");
      const n = await createCardsFromMeetingAction(
        meetingId,
        chosen.map((a) => {
          const parsed = a.due ? parseDueFromTitle(a.due) : null;
          return {
            title: a.title,
            dueAt: parsed?.dueAt,
            dueHasTime: parsed?.hasTime,
            description: a.owner ? `담당: ${a.owner}` : "",
          };
        }),
      );
      toast.success(`카드 ${n}장을 만들었어요`);
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <div className="space-y-3 pt-2 text-sm">
      <ul className="space-y-2">
        {items.map((a, i) => (
          <li key={a.title} className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={selected[i] ?? false}
              onChange={(e) =>
                setSelected((s) =>
                  s.map((v, j) => (j === i ? e.target.checked : v)),
                )
              }
            />
            <span>
              {a.title}
              {(a.owner || a.due) && (
                <span className="text-xs text-muted-foreground">
                  {" "}
                  {a.owner ?? ""} {a.due ?? ""}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>
          취소
        </Button>
        <Button size="sm" onClick={create} disabled={busy}>
          {busy ? "만드는 중…" : `${selected.filter(Boolean).length}장 만들기`}
        </Button>
      </div>
    </div>
  );
  if (isDesktop) {
    return (
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-[420px] sm:max-w-[420px]">
          <SheetHeader>
            <SheetTitle>액션 아이템 → 카드</SheetTitle>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>액션 아이템 → 카드</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {body}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
