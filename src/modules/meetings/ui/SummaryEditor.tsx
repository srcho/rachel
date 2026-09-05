"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  editMeetingSummaryAction,
  regenerateMeetingSummaryAction,
} from "../actions";
import type { MeetingSummary } from "../schema";
export function SummaryEditor({
  id,
  summary,
  canRegenerate = true,
}: {
  id: string;
  summary: MeetingSummary;
  canRegenerate?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [tldr, setTldr] = useState(summary.tldr);
  const [decisions, setDecisions] = useState(summary.decisions.join("\n"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      await editMeetingSummaryAction(id, {
        tldr,
        decisions: decisions
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean),
      });
      setEditing(false);
      toast.success("수정했어요 · 다시 요약해도 유지돼요");
    } catch {
      setError("수정 내용을 저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setTldr(summary.tldr);
            setDecisions(summary.decisions.join("\n"));
            setEditing(!editing);
          }}
        >
          요약·결정 수정
        </Button>
        {canRegenerate && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await regenerateMeetingSummaryAction(id);
                toast.success(
                  "요약했어요 · 직접 수정한 요약과 결정은 유지했어요",
                );
              } catch {
                toast.error("요약하지 못했어요. 기존 내용은 유지돼요.");
              } finally {
                setBusy(false);
              }
            }}
          >
            다시 요약
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                [
                  "결정",
                  ...summary.decisions.map((x) => `- ${x}`),
                  "",
                  "내 할 일",
                  ...summary.actionItems
                    .filter((a) => /^(나|저|본인|me)$/i.test(a.owner ?? ""))
                    .map((a) => `- ${a.title}${a.due ? ` (${a.due})` : ""}`),
                ].join("\n"),
              );
              toast.success("결정과 내 할 일을 복사했어요");
            } catch {
              toast.error("복사하지 못했어요");
            }
          }}
        >
          결정·내 할 일 복사
        </Button>
      </div>
      {editing && (
        <div className="space-y-2 rounded-md border p-3">
          <label className="block text-xs">
            요약
            <textarea
              aria-label="요약 수정"
              maxLength={400}
              value={tldr}
              onChange={(e) => setTldr(e.target.value)}
              className="mt-1 min-h-20 w-full rounded border bg-background p-2 text-sm"
            />
          </label>
          <label className="block text-xs">
            결정 · 한 줄에 하나
            <textarea
              aria-label="결정 수정"
              value={decisions}
              onChange={(e) => setDecisions(e.target.value)}
              className="mt-1 min-h-20 w-full rounded border bg-background p-2 text-sm"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            직접 수정한 부분은 다시 요약해도 유지해요.
          </p>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <Button size="sm" disabled={busy || !tldr.trim()} onClick={save}>
            {busy ? "저장 중…" : "수정 저장"}
          </Button>
        </div>
      )}
    </div>
  );
}
