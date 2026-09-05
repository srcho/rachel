"use client";
import { SquarePen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsDesktop } from "@/core/ui/useMediaQuery";
import { useDock } from "@/modules/agent/dock/store";
import { useKeyboardViewport } from "@/modules/agent/dock/useKeyboardViewport";
import { CaptureComposer } from "./CaptureComposer";

export function QuickCapture({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const chatting = useDock((s) => s.open);
  const pathname = usePathname();
  const desktop = useIsDesktop();
  const panel = useRef<HTMLDivElement>(null);
  useKeyboardViewport(panel, open && !desktop);
  if (
    pathname.startsWith("/capture") ||
    pathname.startsWith("/meetings/live/") ||
    chatting
  )
    return null;
  return (
    <>
      <button
        type="button"
        aria-label="빠른 메모"
        onClick={() => setOpen(true)}
        className="fixed right-20 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] z-40 flex h-12 items-center gap-2 rounded-full border bg-background px-4 text-sm font-medium shadow-sm md:bottom-4"
      >
        <SquarePen className="size-4" />
        메모
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          key={desktop ? "desktop" : "mobile"}
          ref={panel}
          className={
            desktop
              ? "max-h-[84dvh] overflow-y-auto sm:max-w-md"
              : "top-auto bottom-0 left-0 max-h-[32rem] max-w-none translate-x-0 translate-y-0 content-start gap-3 overflow-y-auto rounded-b-none pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-w-none"
          }
        >
          <DialogHeader>
            <DialogTitle>빠른 메모</DialogTitle>
            <DialogDescription>
              메모와 링크는 수집함에 보관해요.
            </DialogDescription>
          </DialogHeader>
          <CaptureComposer userId={userId} onSaved={() => setOpen(false)} />
          <Link
            href="/capture"
            onClick={() => setOpen(false)}
            className="text-xs text-muted-foreground underline"
          >
            저장한 메모 · 수집함 열기
          </Link>
        </DialogContent>
      </Dialog>
    </>
  );
}
