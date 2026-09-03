"use client";
import { Bookmark, Mic, Pause, Play, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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

  async function end() {
    const r = rec.current;
    if (!r) return;
    if (!confirm("회의를 끝낼까요? 남은 전사를 마무리하고 요약을 시작해요."))
      return;
    try {
      const { durationSec } = await r.stop();
      await finalizeMeetingAction(meetingId, durationSec);
      router.replace(`/meetings/${meetingId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "종료 실패");
    }
  }

  const recording = state === "recording";
  const okText = lines.filter((l) => l.status === "ok" && l.text);
  return (
    <div className="flex min-h-[calc(100dvh-3rem)] flex-col">
      <div className="sticky top-12 z-10 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div
            className={cn(
              "flex size-10 items-center justify-center rounded-full",
              recording
                ? "bg-red-500/15 text-red-600"
                : "bg-muted text-muted-foreground",
            )}
          >
            <Mic
              className="size-5"
              style={{ transform: `scale(${1 + Math.min(0.6, level * 8)})` }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{title}</p>
            <p className="text-xs text-muted-foreground">
              {state === "requesting" && "마이크 권한 확인 중…"}
              {state === "recording" && "녹음 중 · 문장 단위로 전사돼요"}
              {state === "paused" && "일시정지"}
              {state === "ending" && "남은 전사를 마무리하는 중…"}
              {state === "error" && `오류: ${error}`}
            </p>
          </div>
          <span className="text-2xl font-semibold tabular-nums">
            {fmtClock(elapsed)}
          </span>
        </div>
        {hidden && recording && (
          <p className="mx-auto mt-2 max-w-3xl rounded bg-amber-100 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            화면을 켜 두세요. 백그라운드에서는 iOS가 마이크를 멈출 수 있어요.
          </p>
        )}
      </div>

      <div
        className="mx-auto w-full max-w-3xl flex-1 space-y-2 px-4 py-4"
        style={{ fontSize }}
      >
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

      <div className="sticky bottom-0 border-t bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setFontSize((f) => Math.min(24, f + 2))}
              aria-label="글자 크게"
            >
              가+
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setFontSize((f) => Math.max(12, f - 2))}
              aria-label="글자 작게"
            >
              가−
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!recording}
              onClick={async () => {
                await bookmarkAction(meetingId, elapsedRef.current);
                toast.success(`중요 표시 ${fmtClock(elapsedRef.current)}`);
              }}
            >
              <Bookmark className="size-4" /> 중요
            </Button>
            {state === "paused" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => rec.current?.resume()}
              >
                <Play className="size-4" /> 재개
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={!recording}
                onClick={() => rec.current?.pause()}
              >
                <Pause className="size-4" /> 일시정지
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              disabled={state !== "recording" && state !== "paused"}
              onClick={end}
            >
              <Square className="size-4" /> 종료
            </Button>
          </div>
        </div>
        <p className="mx-auto mt-1 max-w-3xl text-[11px] text-muted-foreground">
          전사 {okText.length}문장 · 대기{" "}
          {lines.filter((l) => l.status === "queued").length}
        </p>
      </div>
    </div>
  );
}

const bySeq = (a: Line, b: Line) => a.seq - b.seq || a.startMs - b.startMs;
