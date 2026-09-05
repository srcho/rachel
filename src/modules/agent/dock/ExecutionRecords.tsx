"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  executionRecordsAction,
  inspectExecutionAction,
  resumeExecutionAction,
} from "../actions";
import { TOOL_LABEL } from "./ToolCard";

export function ExecutionRecords({
  threadId,
  disabled,
}: {
  threadId: string;
  disabled: boolean;
}) {
  const [records, setRecords] = useState<Awaited<
    ReturnType<typeof executionRecordsAction>
  > | null>(null);
  const [busy, setBusy] = useState(false);
  async function refresh(action?: () => Promise<unknown>) {
    setBusy(true);
    try {
      if (action) await action();
      setRecords(await executionRecordsAction(threadId));
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "작업 기록을 확인하지 못했어요.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="max-h-[30%] shrink-0 overflow-y-auto border-t px-3 py-1.5 text-sm">
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled || busy}
        onClick={() => void refresh()}
      >
        작업 기록 확인
      </Button>
      {records && (
        <div className="max-h-52 space-y-2 overflow-y-auto py-2">
          <p className="text-muted-foreground">
            실제로 시도한 변경 기록이에요. 기록에 없는 요청까지 완료됐다는 뜻은
            아니에요.
          </p>
          {!records.items.length && <p>저장된 변경 기록이 없어요.</p>}
          {records.items.map((record) => (
            <div key={record.id} className="rounded border p-2">
              <p>
                {TOOL_LABEL[record.tool?.replaceAll(".", "_") ?? ""] ??
                  "레이첼 작업"}{" "}
                ·{" "}
                {record.status === "done"
                  ? "결과 확인됨"
                  : record.status === "running" && !record.requiresInspection
                    ? "처리 중"
                    : "결과 확인 필요"}
              </p>
              {record.requiresInspection && (
                <div className="mt-1 flex flex-wrap gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={disabled || busy}
                    onClick={() =>
                      void refresh(() => inspectExecutionAction(record.id))
                    }
                  >
                    실제 결과 대조
                  </Button>
                  {[
                    "tasks.create",
                    "calendar.createEvent",
                    "meetings.createNote",
                    "capture.add",
                  ].includes(record.tool ?? "") && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={disabled || busy}
                      onClick={() =>
                        void refresh(() => resumeExecutionAction(record.id))
                      }
                    >
                      안전하게 이어서 처리
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
          {records.hasMore && (
            <p>
              최근 30개 기록이에요. 레이첼에게 이전 작업 기록 조회를 요청할 수
              있어요.
            </p>
          )}
          <Button variant="ghost" size="sm" onClick={() => setRecords(null)}>
            접기
          </Button>
        </div>
      )}
    </div>
  );
}
