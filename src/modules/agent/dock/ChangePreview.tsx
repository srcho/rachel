"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toolPreviewAction } from "../actions";
export function ChangePreview({
  name,
  input,
  approve,
  reject,
}: {
  name: string;
  input: unknown;
  approve: () => void;
  reject: () => void;
}) {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof toolPreviewAction>
  > | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry explicitly requests the same preview again.
  useEffect(() => {
    let active = true;
    setError("");
    setData(null);
    void toolPreviewAction(name, input)
      .then((r) => {
        if (active) setData(r);
      })
      .catch(() => {
        if (active) setError("변경 대상을 확인하지 못했어요.");
      });
    return () => {
      active = false;
    };
  }, [name, input, retry]);
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
          disabled={!data || data.count === 0}
          onClick={approve}
        >
          변경 실행
        </Button>
        <Button size="sm" variant="outline" onClick={reject}>
          취소
        </Button>
      </div>
    </div>
  );
}
