"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { approveToolAction, toolPreviewAction } from "../actions";
export function ChangePreview({
  toolCallId,
  approve,
  reject,
}: {
  toolCallId: string;
  approve: () => void | Promise<void>;
  reject: () => void | Promise<void>;
}) {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof toolPreviewAction>
  > | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  async function respond(approved: boolean) {
    setSubmitting(true);
    setError("");
    try {
      await approveToolAction(toolCallId, approved);
      await (approved ? approve : reject)();
    } catch (e) {
      setError(e instanceof Error ? e.message : "승인을 저장하지 못했어요.");
      setSubmitting(false);
    }
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry explicitly requests the same preview again.
  useEffect(() => {
    let active = true;
    setError("");
    setData(null);
    void toolPreviewAction(toolCallId)
      .then((r) => {
        if (active) setData(r);
      })
      .catch(() => {
        if (active) setError("변경 대상을 확인하지 못했어요.");
      });
    return () => {
      active = false;
    };
  }, [toolCallId, retry]);
  return (
    <div className="mt-2 space-y-2 text-xs">
      {!data && !error && <p>변경 내용 확인 중…</p>}
      {error && (
        <p role="alert">
          {error}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setRetry((x) => x + 1)}
          >
            다시 시도
          </Button>
        </p>
      )}
      {data && (
        <>
          <p>
            {data.count}개 ·{" "}
            {data.google ? "연결된 Google에도 반영돼요" : "레이첼에 반영돼요"} ·{" "}
            {data.undo ? "30초 안에 되돌리기 가능" : "되돌릴 수 없어요"}
          </p>
          <ul className="max-h-56 divide-y overflow-auto rounded border bg-background px-2">
            {data.rows.map((r, i) => (
              <li key={`${i}:${r.title}`} className="py-2">
                <p className="font-medium">{r.title}</p>
                {r.changes.length ? (
                  r.changes.map((c) => (
                    <p key={c.label} className="mt-1 break-words">
                      {c.label}: {c.before} → {c.after}
                    </p>
                  ))
                ) : (
                  <p className="mt-1">{r.action}</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!data || data.count === 0 || submitting}
          onClick={() => void respond(true)}
        >
          변경 실행
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={submitting}
          onClick={() => void respond(false)}
        >
          취소
        </Button>
      </div>
    </div>
  );
}
