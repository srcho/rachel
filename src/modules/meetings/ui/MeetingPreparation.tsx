"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useDock } from "@/modules/agent/dock/store";
import { meetingPreparationAction } from "../actions";
import { StartMeetingButton } from "./StartMeetingButton";

export function MeetingPreparation({
  eventId,
  title,
}: {
  eventId: string;
  title: string;
}) {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof meetingPreparationAction>
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      setData(await meetingPreparationAction(eventId));
    } catch {
      setError("회의 준비를 불러오지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="rounded-md border p-3 text-sm"
      onToggle={(e) => {
        if (e.currentTarget.open && !data && !busy && !error) void load();
      }}
    >
      <summary className="cursor-pointer font-medium">회의 준비·회의록</summary>
      <div className="mt-3 space-y-3">
        {busy && <p className="text-xs text-muted-foreground">불러오는 중…</p>}
        {error && (
          <p role="alert">
            {error}{" "}
            <Button type="button" variant="ghost" size="sm" onClick={load}>
              다시 시도
            </Button>
          </p>
        )}
        {data && (
          <>
            {data.linked.map((m) => (
              <Link
                key={m.id}
                className="block underline underline-offset-2"
                href={
                  m.status === "recording"
                    ? `/meetings/live/${m.id}`
                    : `/meetings/${m.id}`
                }
              >
                {m.status === "recording" ? "이어서 녹음" : "회의록"} ·{" "}
                {m.title}
              </Link>
            ))}
            <div>
              <h3 className="mb-1 text-xs text-muted-foreground">
                일정에 적힌 의제
              </h3>
              <p className="whitespace-pre-wrap">
                {data.event.description || "등록한 의제가 없어요."}
              </p>
            </div>
            <div>
              <h3 className="mb-1 text-xs text-muted-foreground">
                연결된 이전 회의 결정
              </h3>
              {data.previous.length ? (
                data.previous.map((m) => (
                  <div key={m.id} className="mb-2">
                    <Link
                      className="underline underline-offset-2"
                      href={`/meetings/${m.id}`}
                    >
                      {m.title}
                    </Link>
                    {m.decisions.map((d) => (
                      <p key={d} className="mt-1">
                        {d}
                      </p>
                    ))}
                  </div>
                ))
              ) : (
                <p>실제로 연결된 이전 회의를 찾지 못했어요.</p>
              )}
            </div>
            {data.unverifiedTitleMatches.length > 0 && (
              <div className="text-xs text-muted-foreground">
                같은 제목의 기록이 있지만 관련 회의인지는 확인되지 않았어요.
                {data.unverifiedTitleMatches.map((m) => (
                  <Link
                    key={m.id}
                    className="block underline"
                    href={`/meetings/${m.id}`}
                  >
                    {m.title}
                  </Link>
                ))}
              </div>
            )}
            <div>
              <h3 className="mb-1 text-xs text-muted-foreground">
                미완료 후속 할 일
              </h3>
              {data.tasks.length ? (
                data.tasks.map((t) => (
                  <Link
                    key={t.id}
                    className="block py-1 underline underline-offset-2"
                    href={`/tasks/${t.board_id}?card=${t.id}`}
                  >
                    {t.title}
                  </Link>
                ))
              ) : (
                <p>남은 후속 할 일이 없어요.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const dock = useDock.getState();
                  dock.setUi({
                    route: "/calendar",
                    entity: { type: "calendar_event", id: eventId },
                    label: `회의 준비: ${title}`,
                  });
                  dock.setDraft(
                    dock.threadId,
                    `다음 자료를 바탕으로 이번 회의 의제를 짧게 제안해 줘. 확정된 내용과 AI 제안을 구별하고 없는 사실은 만들지 마.\n${JSON.stringify(data)}`,
                  );
                  dock.setOpen(true);
                }}
              >
                AI 의제 제안 요청
              </Button>
              {!data.linked.some((m) => m.status === "recording") && (
                <StartMeetingButton title={title} calendarEventId={eventId} />
              )}
            </div>
          </>
        )}
      </div>
    </details>
  );
}
