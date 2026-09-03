"use client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * 카드·일정·리뷰 편집용 다이얼로그(사이드 시트 대신). 데스크톱·모바일 공통, 컴팩트 패딩.
 * 제목이 없으면 시각적으로 숨기고 접근성 이름만 남긴다.
 */
export function FormDialog({
  open,
  onClose,
  title,
  hideTitle,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  hideTitle?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          "top-[8dvh] max-h-[84dvh] translate-y-0 gap-3 overflow-y-auto p-4 sm:max-w-md md:top-1/2 md:-translate-y-1/2",
          className,
        )}
      >
        <DialogHeader className={cn("gap-0 pr-6", hideTitle && "sr-only")}>
          <DialogTitle className="text-sm font-medium">{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
