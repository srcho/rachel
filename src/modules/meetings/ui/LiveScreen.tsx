"use client";
import { Bookmark, Mic, Pause, Play, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/core/ui/FormDialog";
import { cn } from "@/lib/utils";
import { bookmarkAction, finalizeMeetingAction } from "../actions";
import { fmtClock } from "../format";
import { MeetingRecorder, type RecorderState } from "../recorder/recorder";
import type { UploadedTurn } from "../recorder/uploader";

interface Line {
  key: string;
  seq: number;
  startMs: number;
  text: string;
  status: "queued" | "ok" | "failed";
  error?: string;
}

export function LiveScreen({
  meetingId,
  title,
}: {
  meetingId: string;
  title: string;
}) {
  const router = useRouter();
  const rec = useRef<MeetingRecorder | null>(null);
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | undefined>();
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [hidden, setHidden] = useState(false);
  const [fontSize, setFontSize] = useState(15);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const durationRef = useRef<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const elapsedRef = useRef(0);

  useEffect(() => {
    const r = new MeetingRecorder(meetingId, {
      onState: (s, e) => {
        setState(s);
        setError(e);
      },
      onLevel: (v) => setLevel(v),
      onTick: (ms) => {
        elapsedRef.current = ms;
        setElapsed(ms);
      },
      onSegmentQueued: (seq, startMs) =>
        setLines((prev) => [
          ...prev,
          { key: `q${seq}`, seq, startMs, text: "", status: "queued" },
        ]),
      onTurns: (seq, turns: UploadedTurn[], err) => {
        setLines((prev) => {
          const rest: Line[] = prev.filter((l) => l.seq !== seq);
          if (err || turns.length === 0) {
            const line: Line = {
              key: `f${seq}`,
              seq,
              startMs: prev.find((l) => l.seq === seq)?.startMs ?? 0,
              text: "",
              status: err ? "failed" : "ok",
              error: err,
            };
            return [...rest, line].sort(bySeq);
          }
          const mapped: Line[] = turns.map((t) => ({
            key: t.id,
            seq,
            startMs: t.start_ms,
            text: t.text,
            status: "ok",
          }));
          return [...rest, ...mapped].sort(bySeq);
        });
      },
    });
    rec.current = r;
    void r.start();
    const onVis = () => setHidden(document.visibilityState !== "visible");
    document.addEventListener("visibilitychange", onVis);
    const onUnload = (e: BeforeUnloadEvent) => {
      if (r.state === "recording" || r.state === "paused") e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [meetingId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  });

  /** 종료: 남은 세그먼트 업로드 → 서버에 종료 알림(요약 시작) → 상세로. 실패하면 화면에 남아 다시 시도 */
  async function end() {
    const r = rec.current;
    if (!r) return;
    setConfirmEnd(false);
    setEndError(null);
    try {
      if (durationRef.current === null) {
        const { durationSec } = await r.stop();
        durationRef.current = durationSec;
      }
      await finalizeMeetingAction(meetingId, durationRef.current);
      router.replace(`/meetings/${meetingId}`);
    } catch (e) {
      setEndError(e instanceof Error ? e.message : "종료 실패");
    }
  }

  const recording = state === "recording";
  const live = recording || state === "paused";
  const queued = lines.filter((l) => l.status === "queued").length;
  const okText = lines.filter((l) => l.status === "ok" && l.text);
  return (
    <div data-immersive className="flex h-[calc(100dvh-3rem)] flex-col">
      <div className="shrink-0 border-b bg-background px-4 py-2.5">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full",
              recording
                ? "bg-red-500/15 text-red-600"
                : "bg-muted text-muted-foreground",
            )}
          >
            <Mic
              className="size-4"
              style={{ transform: `scale(${1 + Math.min(0.6, level * 8)})` }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {state === "requesting" && "마이크 권한 확인 중…"}
              {state === "recording" && "녹음 중 · 문장 단위로 전사돼요"}
              {state === "paused" && "일시정지 · 마이크는 켜져 있어요"}
              {state === "ending" && `마무리 중 · 남은 전사 ${queued}개 업로드`}
              {state === "done" && (endError ? "종료 실패" : "요약 시작 중…")}
              {state === "error" && `오류: ${error}`}
            </p>
          </div>
          <span
            className={cn(
              "text-xl font-semibold tabular-nums",
              state === "paused" && "text-muted-foreground",
            )}
          >
            {fmtClock(elapsed)}
          </span>
        </div>
        {hidden && recording && (
          <p className="mx-auto mt-2 max-w-3xl rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            화면을 켜 두세요. 백그라운드에서는 iOS가 마이크를 멈출 수 있어요.
          </p>
        )}
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        style={{ fontSize }}
      >
        <div className="mx-auto max-w-3xl space-y-2">
          {lines.length === 0 && state === "recording" && (
            <p className="text-sm text-muted-foreground">
              말을 시작하면 8~20초 단위로 전사가 나타나요.
            </p>
          )}
          {lines.map((l) => (
            <div key={l.key} className="flex gap-3">
              <span className="w-12 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
                {fmtClock(l.startMs)}
              </span>
              {l.status === "queued" ? (
                <span className="text-muted-foreground">전사 중…</span>
              ) : l.status === "failed" ? (
                <span className="text-xs text-destructive">
                  전사 실패 {l.error ? `(${l.error.slice(0, 60)})` : ""}
                </span>
              ) : (
                <p className="leading-relaxed">{l.text}</p>
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>

      <div className="shrink-0 border-t bg-background px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-3xl space-y-2">
          {endError && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
              <span className="min-w-0 truncate text-destructive">
                {endError}
              </span>
              <div className="flex shrink-0 gap-1">
                <Button size="xs" onClick={end}>
                  다시 시도
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => router.replace("/meetings")}
                >
                  목록으로
                </Button>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={!recording}
              aria-label="중요 표시"
              onClick={async () => {
                await bookmarkAction(meetingId, elapsedRef.current);
                toast.success(`중요 표시 ${fmtClock(elapsedRef.current)}`);
              }}
            >
              <Bookmark />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setFontSize((f) => Math.max(12, f - 2))}
              aria-label="글자 작게"
            >
              <span className="text-xs">가-</span>
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setFontSize((f) => Math.min(24, f + 2))}
              aria-label="글자 크게"
            >
              <span className="text-xs">가+</span>
            </Button>
            <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
              {okText.length}문장{queued > 0 ? ` · 대기 ${queued}` : ""}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {state === "paused" ? (
              <Button
                className="h-11"
                variant="outline"
                onClick={() => void rec.current?.resume()}
              >
                <Play /> 재개
              </Button>
            ) : (
              <Button
                className="h-11"
                variant="outline"
                disabled={!recording}
                onClick={() => void rec.current?.pause()}
              >
                <Pause /> 일시정지
              </Button>
            )}
            <Button
              className="h-11"
              variant="destructive"
              disabled={!live && !endError}
              onClick={() => (endError ? end() : setConfirmEnd(true))}
            >
              <Square /> 종료
            </Button>
          </div>
        </div>
      </div>

      <FormDialog
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        title="회의를 끝낼까요?"
      >
        <p className="text-sm text-muted-foreground">
          남은 전사 {queued}개를 마무리하고 요약을 시작해요. 녹음 파일은 이
          기기에 남아요.
        </p>
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmEnd(false)}
          >
            계속 녹음
          </Button>
          <Button variant="destructive" size="sm" onClick={end}>
            종료하고 요약
          </Button>
        </div>
      </FormDialog>
    </div>
  );
}

const bySeq = (a: Line, b: Line) => a.seq - b.seq || a.startMs - b.startMs;
