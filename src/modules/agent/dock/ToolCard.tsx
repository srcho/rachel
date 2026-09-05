"use client";
import { ChevronRight, Loader2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { undoAction } from "../actions";
import { ChangePreview } from "./ChangePreview";
import { resultLinks } from "./result-links";

const TOOL_LABEL: Record<string, string> = {
  tasks_listBoards: "보드 확인",
  tasks_list: "할 일 목록 조회",
  tasks_get: "할 일 조회",
  tasks_create: "할 일 생성",
  tasks_update: "할 일 수정",
  tasks_move: "할 일 이동",
  tasks_complete: "할 일 완료",
  tasks_bulkUpdate: "할 일 일괄 변경",
  tasks_archive: "할 일 보관",
  tasks_delete: "할 일 삭제",
  calendar_listEvents: "일정 조회",
  calendar_getEvent: "일정 상세",
  calendar_createEvent: "일정 생성",
  calendar_updateEvent: "일정 수정",
  calendar_deleteEvent: "일정 삭제",
  calendar_findFreeSlots: "빈 시간 찾기",
  memory_remember: "기억 저장",
  memory_recall: "기억 회상",
  memory_list: "기억 목록",
  memory_update: "기억 수정",
  memory_forget: "기억 삭제",
  memory_searchAll: "전체 검색",
  capture_add: "수집함에 넣기",
  capture_list: "수집함 목록",
  capture_resolve: "수집함 확정",
  capture_dismiss: "수집함 무시",
  meetings_list: "회의 목록",
  meetings_get: "회의 요약 조회",
  meetings_search: "회의 검색",
  meetings_summarize: "회의 재요약",
  meetings_createTasksFromActionItems: "후속 할 일 추가",
  meetings_delete: "회의 삭제",
  insights_generateBrief: "브리핑 생성",
};

export interface ToolPartLike {
  type: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  approval?: { id: string; isAutomatic?: boolean; approved?: boolean };
}

function summary(name: string, part: ToolPartLike): string {
  const input = (part.input ?? {}) as Record<string, unknown>;
  const output = part.output as Record<string, unknown> | unknown[] | undefined;
  const titled =
    output && !Array.isArray(output) && typeof output.title === "string"
      ? `“${output.title}”`
      : "";
  switch (name) {
    case "tasks_create":
      return typeof input.title === "string" ? `“${input.title}”` : "";
    case "tasks_update":
    case "tasks_move":
    case "tasks_complete":
    case "tasks_archive":
    case "tasks_delete":
    case "calendar_createEvent":
    case "calendar_updateEvent":
    case "calendar_deleteEvent":
    case "meetings_delete":
      return titled;
    case "tasks_list":
    case "memory_list":
    case "meetings_list":
    case "meetings_search":
    case "memory_recall":
    case "memory_searchAll":
      return Array.isArray(output) ? `${output.length}건` : "";
    case "calendar_listEvents": {
      const events =
        output && !Array.isArray(output) ? output.events : undefined;
      return Array.isArray(events) ? `${events.length}건` : "";
    }
    case "calendar_findFreeSlots":
      return Array.isArray(output) ? `${output.length}개 구간` : "";
    case "tasks_bulkUpdate":
      return Array.isArray(input.ids) ? `${input.ids.length}건` : "";
    case "meetings_createTasksFromActionItems": {
      const n = output && !Array.isArray(output) ? output.created : undefined;
      return typeof n === "number" ? `${n}장` : "";
    }
    default:
      return "";
  }
}

export function ToolCard({
  part,
  onApprove,
}: {
  part: ToolPartLike;
  onApprove?: (id: string, approved: boolean) => void;
}) {
  const name = part.type.replace(/^tool-/, "");
  const label = TOOL_LABEL[name] ?? name;
  const [open, setOpen] = useState(false);
  const [undone, setUndone] = useState(false);
  const running =
    part.state === "input-streaming" || part.state === "input-available";
  const failed =
    part.state === "output-error" || part.state === "output-denied";
  const links =
    part.state === "output-available" ? resultLinks(name, part.output) : [];
  const undoId = (part.output as { _undo?: string } | undefined)?._undo;

  if (
    part.state === "approval-requested" &&
    part.approval &&
    !part.approval.isAutomatic
  ) {
    return (
      <div className="my-1 rounded-md border border-border bg-muted/30 p-2.5 text-sm">
        <p className="font-medium">
          {label} {summary(name, part)} — 실행할까요?
        </p>
        <ChangePreview
          name={name}
          input={part.input}
          approve={() => onApprove?.(part.approval?.id ?? "", true)}
          reject={() => onApprove?.(part.approval?.id ?? "", false)}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "my-1 rounded-md border bg-muted/40 text-xs",
        failed && "border-destructive/50",
      )}
    >
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {running ? (
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
        ) : (
          <ChevronRight
            className={cn(
              "size-3 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
        )}
        <span className="font-medium">{label}</span>
        <span className="truncate text-muted-foreground">
          {summary(name, part)}
        </span>
        {part.state === "approval-responded" &&
          part.approval?.approved === false && (
            <span className="ml-auto text-muted-foreground">거절됨</span>
          )}
        {failed && (
          <span className="ml-auto text-destructive">
            {part.state === "output-denied" ? "거절됨" : "실패"}
          </span>
        )}
        {undone && (
          <span className="ml-auto text-muted-foreground">되돌림</span>
        )}
      </button>
      {undoId && !undone && (
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 px-1.5 text-[11px]"
          onClick={async (e) => {
            e.stopPropagation();
            const r = await undoAction(undoId);
            if (r.ok) {
              setUndone(true);
              toast.success("되돌렸어요");
            } else toast.error(r.reason ?? "되돌리기 실패");
          }}
        >
          <Undo2 className="size-3" /> 되돌리기
        </Button>
      )}
      {links.length > 0 && (
        <ul className="divide-y border-t">
          {links.map((link) => (
            <li key={link.href}>
              <Link className="block px-2 py-2 hover:bg-muted" href={link.href}>
                <span className="block truncate text-sm">{link.title}</span>
                {link.detail && (
                  <span className="text-xs text-muted-foreground">
                    {link.detail}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <pre className="max-h-48 overflow-auto border-t px-2 py-1.5 text-[11px] text-muted-foreground">
          {part.errorText ??
            JSON.stringify({ input: part.input, output: part.output }, null, 1)}
        </pre>
      )}
    </div>
  );
}
