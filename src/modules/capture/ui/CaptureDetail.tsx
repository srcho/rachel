"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  deleteCaptureAction,
  editCaptureAction,
  restoreCaptureAction,
} from "../actions";
import type { CaptureRow } from "../service";
import { Inbox } from "./Inbox";

export function CaptureDetail({
  capture,
  userId,
}: {
  capture: CaptureRow;
  userId: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(capture.raw_text);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const closed = ["resolved", "dismissed"].includes(capture.status);
  function run(action: () => Promise<unknown>, message: string) {
    start(async () => {
      try {
        await action();
        toast.success(message);
        setEditing(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "처리하지 못했어요");
      }
    });
  }
  return (
    <div className="space-y-4">
      <Inbox items={[capture]} userId={userId} />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending || capture.status === "resolving"}
          onClick={() => {
            setText(capture.raw_text);
            setEditing(!editing);
          }}
        >
          원문 수정
        </Button>
        {closed && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () => restoreCaptureAction(capture.id),
                "수집함으로 복원했어요",
              )
            }
          >
            수집함으로 복원
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={pending || capture.status === "resolving"}
          onClick={() => setConfirmDelete(!confirmDelete)}
        >
          메모 삭제
        </Button>
      </div>
      {editing && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => editCaptureAction(capture.id, text, capture.updated_at),
              "원문을 수정했어요",
            );
          }}
        >
          <textarea
            aria-label="메모 원문"
            className="min-h-40 w-full rounded-md border bg-background p-3 text-sm"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={4000}
            required
          />
          {capture.resolved_ref && (
            <p className="text-xs text-muted-foreground">
              이미 만든 할 일·일정·기억은 연결된 항목에서 수정해 주세요.
            </p>
          )}
          <Button size="sm" disabled={pending} type="submit">
            원문 저장
          </Button>
        </form>
      )}
      {confirmDelete && (
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm">
            이 메모를 영구 삭제할까요? 이미 만든 할 일·일정·기억은 유지돼요.
          </p>
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() =>
              run(async () => {
                await deleteCaptureAction(capture.id, capture.updated_at);
                router.push("/capture");
              }, "메모를 삭제했어요")
            }
          >
            영구 삭제
          </Button>
        </div>
      )}
    </div>
  );
}
