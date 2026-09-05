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

export const TOOL_LABEL: Record<string, string> = {
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
  tasks_restore: "할 일 복원",
  tasks_plan: "오늘 계획 변경",
  tasks_schedule: "할 일 시간 잡기",
  tasks_reschedule: "작업 시간 이동",
  tasks_unschedule: "작업 시간 해제",
  calendar_connectionStatus: "캘린더 연결 확인",
  calendar_setSelected: "캘린더 선택",
  calendar_sync: "캘린더 새로고침",
  calendar_conflictVersions: "일정 변경 비교",
  calendar_resolveConflict: "일정 충돌 해결",
  calendar_retryPush: "Google 반영 재시도",
  calendar_googleTasksStatus: "Google Tasks 연결 확인",
  calendar_googleTasksSetEnabled: "Google Tasks 연결 설정",
  calendar_googleTasksPull: "Google Tasks 가져오기",
  memory_get: "기억 상세",
  memory_reviewList: "확인할 기억 조회",
  memory_resolveReview: "기억 정정 확인",
  memory_archive: "기억 보관",
  memory_restore: "기억 복원",
  capture_get: "수집함 메모 읽기",
  capture_edit: "수집함 메모 수정",
  capture_retriage: "메모 다시 분류",
  capture_restore: "수집함 복원",
  capture_delete: "수집함 메모 삭제",
  meetings_createNote: "회의 메모 작성",
  meetings_readContent: "회의 원문 읽기",
  meetings_editTitle: "회의 제목 수정",
  meetings_editSpeaker: "발언자 수정",
  meetings_editSummary: "회의 요약 교정",
  meetings_editTranscript: "회의 전사 교정",
  meetings_prepare: "회의 준비",
  meetings_reviewActionItems: "회의 후속 확인",
  insights_weeklyReview: "주간 회고",
  insights_todayPlan: "오늘 계획 확인",
  agent_listThreads: "대화 목록",
  agent_getThread: "대화 읽기",
  agent_renameThread: "대화 이름 변경",
  agent_deleteThread: "대화 삭제",
  agent_workingState: "진행 상황 확인",
  agent_listExecutions: "작업 기록",
  agent_getExecution: "작업 결과 확인",
  agent_reconcileExecution: "작업 결과 대조",
  agent_resumeExecution: "중단한 작업 이어서 처리",
  agent_getPreferences: "비서 선호 확인",
  agent_updatePreferences: "비서 선호 변경",
  system_listBackups: "백업 확인",
  system_backup: "내 데이터 백업",
  system_export: "내 데이터 내보내기",
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
  if (output && !Array.isArray(output)) {
    if (output.syncStatus === "pending_push")
      return "레이첼 저장됨 · Google 반영 대기";
    if (output.syncStatus === "conflict")
      return "레이첼 저장됨 · Google 변경 비교 필요";
    if (output.localDeleted === true) return "삭제됨 · Google 반영 확인";
    if (output.changed === false) return "이미 처리된 상태 · 추가 변경 없음";
    const rows =
      output.items ?? output.events ?? output.results ?? output.cards;
    if (Array.isArray(rows))
      return `${rows.length}건${output.hasMore ? " · 더 있음" : ""}${output.complete === false ? " · 조회 범위 확인 필요" : ""}`;
  }
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

function resultDetail(output: unknown): string {
  if (output && typeof output === "object" && !Array.isArray(output)) {
    const value = output as Record<string, unknown>;
    if (value.operationalSettingsChanged === false && value.nextTool)
      return "기억으로 저장했어요. 일정 추천 규칙을 바꾸려면 비서 선호에도 적용해야 해요.";
    const detail = [
      value.message,
      value.reason,
      value.notice,
      value.appliesTo,
    ].filter((v): v is string => typeof v === "string");
    if (detail.length) return detail.join("\n");
    if (value.complete === false || value.hasMore === true)
      return "일부 범위의 결과예요. 추가 조회나 동기화가 필요할 수 있어요.";
  }
  return "결과는 연결된 항목과 레이첼 답변에서 확인할 수 있어요.";
}

export function ToolCard({
  part,
  onApprove,
}: {
  part: ToolPartLike;
  onApprove?: (id: string, approved: boolean) => void;
}) {
  const name = part.type.replace(/^tool-/, "");
  const label = TOOL_LABEL[name] ?? "레이첼 작업";
  const [open, setOpen] = useState(false);
  const [undone, setUndone] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const running =
    part.state === "input-streaming" || part.state === "input-available";
  const failed =
    part.state === "output-error" || part.state === "output-denied";
  const links =
    part.state === "output-available" ? resultLinks(name, part.output) : [];
  const rawUndo = (part.output as { _undo?: unknown } | undefined)?._undo;
  const undoId = typeof rawUndo === "string" ? rawUndo : undefined;

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
          toolCallId={part.toolCallId}
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
          disabled={undoing}
          onClick={async (e) => {
            e.stopPropagation();
            setUndoing(true);
            try {
              const r = await undoAction(undoId);
              if (r.ok) {
                setUndone(true);
                toast.success("되돌렸어요");
              } else toast.error(r.reason ?? "되돌리기 실패");
            } catch (error) {
              toast.error(
                error instanceof Error ? error.message : "되돌리지 못했어요.",
              );
            } finally {
              setUndoing(false);
            }
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
        <div className="max-h-48 space-y-1 overflow-auto border-t px-2 py-2 text-sm text-muted-foreground">
          {part.errorText ? (
            <p role="alert">{part.errorText}</p>
          ) : (
            <p>{resultDetail(part.output)}</p>
          )}
        </div>
      )}
    </div>
  );
}
