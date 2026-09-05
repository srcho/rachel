"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fmtDateTime } from "@/core/utils/date";
import {
  calendarConflictAction,
  resolveCalendarConflictAction,
  retryEventPushAction,
} from "../actions";

type Comparison = Awaited<ReturnType<typeof calendarConflictAction>>;
export function SyncStatus({
  id,
  status,
  timezone,
  onChanged,
}: {
  id: string;
  status: string;
  timezone: string;
  onChanged: () => void;
}) {
  const [versions, setVersions] = useState<Comparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Google에 연결하지 못했어요");
    } finally {
      setBusy(false);
    }
  }
  async function choose(choice: "local" | "remote") {
    if (!versions?.remote.etag) return;
    await run(async () => {
      const result = await resolveCalendarConflictAction(
        id,
        choice,
        versions.local.updated_at,
        versions.remote.etag ?? "",
      );
      if (result.sync_status !== "synced")
        throw new Error(
          "아직 Google에 반영되지 않았어요. 연결 상태를 확인해 주세요.",
        );
      setVersions(null);
      onChanged();
    });
  }
  return (
    <section
      className="space-y-2 rounded-md border p-2 text-xs"
      aria-label="일정 저장 상태"
    >
      <p>
        레이첼에 저장됨 ·{" "}
        {status === "synced"
          ? "Google 반영됨"
          : status === "conflict"
            ? "Google 변경과 충돌"
            : "Google 반영 대기"}
      </p>
      {status !== "synced" && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (status === "conflict")
                  setVersions(await calendarConflictAction(id));
                else {
                  const row = await retryEventPushAction(id);
                  if (row.sync_status !== "synced")
                    throw new Error(
                      "Google 반영을 완료하지 못했어요. 다시 연결한 뒤 재시도해 주세요.",
                    );
                  onChanged();
                }
              })
            }
          >
            {busy
              ? "확인 중…"
              : status === "conflict"
                ? "두 내용 비교"
                : "Google에 다시 반영"}
          </Button>
          <Link
            href="/api/integrations/google/start?next=/calendar"
            prefetch={false}
            className="underline underline-offset-2"
          >
            Google 다시 연결
          </Link>
        </div>
      )}
      {versions && (
        <>
          <div className="grid grid-cols-2 divide-x rounded border">
            {(["local", "remote"] as const).map((side) => {
              const row = versions[side];
              const modified =
                side === "local"
                  ? versions.local.updated_at
                  : versions.remote.remote_updated_at;
              return (
                <div key={side} className="space-y-1 p-2">
                  <p className="font-medium">
                    {side === "local" ? "레이첼" : "Google"}
                  </p>
                  <p>{row.title}</p>
                  {row.deleted_at ? (
                    <p className="text-destructive">삭제된 일정</p>
                  ) : (
                    <>
                      <p>
                        {row.start_at
                          ? fmtDateTime(row.start_at, timezone)
                          : "시작 미정"}
                      </p>
                      <p>
                        ~{" "}
                        {row.end_at
                          ? fmtDateTime(row.end_at, timezone)
                          : "종료 미정"}
                      </p>
                      <p>{row.location || "장소 없음"}</p>
                      <p className="whitespace-pre-wrap">
                        {row.description || "설명 없음"}
                      </p>
                    </>
                  )}
                  <p className="text-muted-foreground">
                    수정{" "}
                    {modified
                      ? fmtDateTime(modified, timezone)
                      : "시각 확인 불가"}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void choose("local")}
            >
              레이첼 내용 사용
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void choose("remote")}
            >
              Google 내용 사용
            </Button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
