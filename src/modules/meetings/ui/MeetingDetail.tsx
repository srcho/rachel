"use client";
import { ListChecks, MessageSquare, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Database } from "@/core/db/types.generated";
import { FEATURE_LABEL } from "@/core/llm/features";
import { useTableChanges } from "@/core/realtime/useTableChanges";
import { Page } from "@/core/ui/Page";
import { PageHeader } from "@/core/ui/PageHeader";
import { DEFAULT_TZ, fmtDateTime } from "@/core/utils/date";
import { formatCost } from "@/core/utils/format";
import { cn } from "@/lib/utils";
import { useDock } from "@/modules/agent/dock/store";
import {
  deleteMeetingAction,
  renameMeetingAction,
  setSpeakerNameAction,
} from "../actions";
import { useFinalPass } from "../finalpass/useFinalPass";
import { FINAL_LABEL, fmtClock, fmtDuration, STATUS_LABEL } from "../format";
import { audioStore } from "../recorder/audio-store";
import type { MeetingRow, SegmentRow } from "../repository";
import type { MeetingSummary } from "../schema";
import { ReviewSheet } from "./ReviewSheet";
import { SummaryEditor } from "./SummaryEditor";
import { TranscriptText } from "./TranscriptText";

interface Props {
  meeting: MeetingRow;
  pass: "live" | "final";
  segments: SegmentRow[];
  costs: Record<string, number>;
  linkedCards: Array<{
    board_id: string;
    id: string;
    title: string;
    completed_at: string | null;
    creation_key: string | null;
    archived_at: string | null;
  }>;
  reviewedFollowups: Database["public"]["Tables"]["meeting_followups"]["Row"][];
  userId: string;
}

export function MeetingDetail({
  meeting,
  pass,
  segments,
  costs,
  linkedCards,
  reviewedFollowups,
  userId,
}: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const initialAt = search.get("at");
  const refresh = useCallback(() => router.refresh(), [router]);
  useTableChanges(["meetings", "transcript_segments"], userId, refresh);
  const [tab, setTab] = useState<"summary" | "transcript">(
    initialAt === null ? "summary" : "transcript",
  );
  const [sourceAt, setSourceAt] = useState<number | null>(
    initialAt !== null && Number.isFinite(Number(initialAt))
      ? Number(initialAt)
      : null,
  );
  const [review, setReview] = useState(false);
  const [recordings, setRecordings] = useState<
    Array<{ url: string; startMs: number; endMs: number }>
  >([]);
  const [recordingIndex, setRecordingIndex] = useState(0);
  const pendingSeek = useRef<number | null>(null);
  const audioUrl = recordings[recordingIndex]?.url;
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const summary = meeting.summary as MeetingSummary | null;
  const isNote =
    !meeting.audio_local_key &&
    meeting.final_pass_status === "skipped" &&
    segments.length === 0;
  const speakerMap = (meeting.speaker_map as Record<string, string>) ?? {};
  const finalPass = useFinalPass(meeting);
  const dock = useDock();

  useEffect(() => {
    useDock.getState().setUi({
      route: `/meetings/${meeting.id}`,
      entity: { type: "meeting", id: meeting.id },
      label: `회의: ${meeting.title}`,
    });
  }, [meeting.id, meeting.title]);
  useEffect(() => {
    if (tab !== "transcript" || sourceAt === null) return;
    const target =
      segments.find((s) => s.start_ms >= sourceAt) ?? segments.at(-1);
    if (target)
      document
        .getElementById(`segment-${target.id}`)
        ?.scrollIntoView({ block: "center" });
  }, [tab, sourceAt, segments]);
  function openSource(ms: number) {
    setSourceAt(ms);
    setTab("transcript");
  }

  useEffect(() => {
    let disposed = false;
    let urls: string[] = [];
    void audioStore
      .getRecordings(meeting.id)
      .then((parts) => {
        if (disposed) return;
        const tracks = parts.map((p) => ({
          url: URL.createObjectURL(p.blob),
          startMs: p.startMs,
          endMs: p.endMs,
        }));
        urls = tracks.map((p) => p.url);
        setRecordings(tracks);
        setRecordingIndex(0);
      })
      .catch(() => toast.error("이 기기의 녹음을 불러오지 못했어요"));
    return () => {
      disposed = true;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [meeting.id]);

  function seekRecording(ms: number) {
    const index = recordings.findLastIndex((p) => p.startMs <= ms);
    const recording = recordings[index];
    if (!recording) return;
    const seconds = (ms - recording.startMs) / 1000;
    if (index === recordingIndex && audioEl) {
      audioEl.currentTime = seconds;
      void audioEl.play().catch(() => {});
    } else {
      pendingSeek.current = seconds;
      setRecordingIndex(index);
    }
  }

  const speakers = [
    ...new Set(
      segments.map((s) => s.speaker).filter((s): s is string => Boolean(s)),
    ),
  ].sort();
  const totalCost = Object.values(costs).reduce((a, b) => a + b, 0);

  async function rename() {
    const t = prompt("회의 제목", meeting.title);
    if (t !== null && t.trim()) await renameMeetingAction(meeting.id, t);
  }
  async function renameSpeaker(sp: string) {
    const name = prompt(
      `${speakerMap[sp] ?? `화자 ${sp.replace(/^S/, "")}`} 의 이름`,
      speakerMap[sp] ?? "",
    );
    if (name !== null) await setSpeakerNameAction(meeting.id, sp, name.trim());
  }
  async function remove() {
    if (!confirm("이 회의와 전사·요약을 삭제할까요? 되돌릴 수 없어요.")) return;
    await deleteMeetingAction(meeting.id);
    await audioStore.deleteRecording(meeting.id).catch(() => {});
    await audioStore.deletePcm(meeting.id).catch(() => {});
    router.replace("/meetings");
  }

  return (
    <>
      <PageHeader
        title={meeting.title}
        actions={
          <>
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={rename}
              aria-label="제목 수정"
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                dock.setUi({
                  route: `/meetings/${meeting.id}`,
                  entity: { type: "meeting", id: meeting.id },
                  label: `회의: ${meeting.title}`,
                });
                dock.setOpen(true);
              }}
            >
              <MessageSquare className="size-4" /> 물어보기
            </Button>
          </>
        }
      />
      <Page width="narrow" className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{fmtDateTime(meeting.started_at, DEFAULT_TZ, "short")}</span>
          {meeting.duration_sec ? (
            <span>{fmtDuration(meeting.duration_sec)}</span>
          ) : null}
          <Badge variant={meeting.status === "ready" ? "secondary" : "outline"}>
            {STATUS_LABEL[meeting.status]}
          </Badge>
          {meeting.final_pass_status !== "skipped" && (
            <Badge variant="secondary">
              {FINAL_LABEL[meeting.final_pass_status]}
              {finalPass.progress
                ? ` ${finalPass.progress.done}/${finalPass.progress.total}`
                : ""}
            </Badge>
          )}
          {totalCost > 0 && (
            <span
              className="tabular-nums"
              title={Object.entries(costs)
                .map(([k, v]) => `${FEATURE_LABEL[k] ?? k} ${formatCost(v)}`)
                .join(" · ")}
            >
              비용 {formatCost(totalCost)}
            </span>
          )}
          {finalPass.status === "failed" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => finalPass.retry()}
            >
              화자 분리 다시 시도
            </Button>
          )}
        </div>

        <output className="block rounded-md border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {isNote
            ? "녹음 없는 메모"
            : `녹음 ${audioUrl ? "이 기기에 저장됨" : "녹음한 기기에 보관"}`}{" "}
          · 요약{" "}
          {meeting.status === "ready"
            ? "저장됨"
            : meeting.status === "failed"
              ? "실패 · 다시 시도 필요"
              : "준비 중"}{" "}
          · 화자 정리 {FINAL_LABEL[finalPass.status] || "사용 안 함"}
          <br />
          {finalPass.status === "pending" ||
          finalPass.status === "running" ||
          finalPass.status === "failed"
            ? "요약은 서버에서 준비해요. 화자 정리는 녹음한 기기에서 이 화면을 열어 마무리해 주세요."
            : "화면을 닫아도 돼요. 저장된 요약과 전사는 다른 기기에서도 볼 수 있어요."}
        </output>
        {meeting.calendar_event_id && (
          <Link
            className="text-xs underline underline-offset-2"
            href={`/calendar?event=${meeting.calendar_event_id}`}
          >
            원본 일정 열기
          </Link>
        )}
        {recordings.length > 1 && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            녹음 구간
            <select
              className="rounded-md border bg-background px-2 py-1.5 text-foreground"
              value={recordingIndex}
              onChange={(e) => setRecordingIndex(Number(e.target.value))}
            >
              {recordings.map((p, i) => (
                <option key={p.url} value={i}>
                  {i + 1} · {fmtClock(p.startMs)}부터
                </option>
              ))}
            </select>
          </label>
        )}
        {audioUrl ? (
          // biome-ignore lint/a11y/useMediaCaption: 회의 녹음(자막은 전사 탭)
          <audio
            ref={setAudioEl}
            src={audioUrl}
            controls
            className="w-full"
            preload="metadata"
            onLoadedMetadata={() => {
              if (pendingSeek.current !== null && audioEl) {
                audioEl.currentTime = pendingSeek.current;
                pendingSeek.current = null;
                void audioEl.play().catch(() => {});
              }
            }}
            onEnded={() => {
              if (recordingIndex + 1 < recordings.length) {
                pendingSeek.current = 0;
                setRecordingIndex(recordingIndex + 1);
              }
            }}
          />
        ) : !isNote ? (
          <p className="text-xs text-muted-foreground">
            이 기기에 녹음 파일이 없어요(녹음한 기기에서만 재생돼요).
          </p>
        ) : null}

        <div className="flex gap-1 border-b text-sm">
          {(isNote
            ? ["summary" as const]
            : (["summary", "transcript"] as const)
          ).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "-mb-px border-b-2 px-3 py-1.5",
                tab === t
                  ? "border-primary font-medium"
                  : "border-transparent text-muted-foreground",
              )}
            >
              {t === "summary"
                ? isNote
                  ? "메모"
                  : "요약"
                : `전사 (${segments.length})`}
            </button>
          ))}
        </div>

        {tab === "summary" ? (
          meeting.status === "processing" ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              요약을 만드는 중이에요. 잠시 후 자동으로 나타나요.
            </p>
          ) : summary ? (
            <div className="space-y-4 text-sm">
              <SummaryEditor
                id={meeting.id}
                summary={summary}
                canRegenerate={!isNote}
              />
              {!meeting.audio_local_key && meeting.summary_md && (
                <details className="rounded-md border p-3">
                  <summary className="cursor-pointer text-xs">
                    메모 원문 전체
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap">
                    {meeting.summary_md}
                  </p>
                </details>
              )}
              <p className="text-base leading-relaxed">{summary.tldr}</p>
              <Section title="핵심" items={summary.keyPoints} />
              {summary.decisions.length > 0 && (
                <div>
                  <h3 className="mb-1 font-medium">결정</h3>
                  <ul className="space-y-1">
                    {summary.decisions.map((decision, i) => {
                      const at = summary.decisionSources?.find(
                        (d) => d.decisionIndex === i,
                      )?.sourceAtMs?.[0];
                      return (
                        <li key={decision}>
                          {decision}
                          {at !== undefined && (
                            <button
                              type="button"
                              className="ml-2 py-1 text-xs underline underline-offset-2"
                              onClick={() => openSource(at)}
                            >
                              근거 {fmtClock(at)}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {summary.actionItems.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <h3 className="font-medium">후속 할 일</h3>
                    <Button size="sm" onClick={() => setReview(true)}>
                      <ListChecks className="size-4" /> 검토하고 추가
                    </Button>
                  </div>
                  <ul className="list-disc space-y-0.5 pl-5">
                    {summary.actionItems.map((a) => (
                      <li key={a.title}>
                        {a.title}
                        {a.sourceAtMs?.[0] !== undefined && (
                          <button
                            type="button"
                            className="ml-2 py-1 text-xs underline underline-offset-2"
                            onClick={() => {
                              const at = a.sourceAtMs?.[0];
                              if (at !== undefined) openSource(at);
                            }}
                          >
                            근거 {fmtClock(a.sourceAtMs[0])}
                          </button>
                        )}
                        {(a.ownerInferred || a.dueInferred) && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            담당·기한 추정 · 확인 필요
                          </span>
                        )}
                        {a.owner && (
                          <span className="text-muted-foreground">
                            {" "}
                            · {a.owner}
                          </span>
                        )}
                        {a.due && (
                          <span className="text-muted-foreground">
                            {" "}
                            ({a.due})
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {linkedCards.length > 0 && (
                <div>
                  <h3 className="mb-1 font-medium">연결된 할 일</h3>
                  <ul className="space-y-0.5">
                    {linkedCards.map((c) => (
                      <li
                        key={c.id}
                        className={cn(
                          c.completed_at &&
                            "line-through text-muted-foreground",
                        )}
                      >
                        <Link
                          href={`/tasks/${c.board_id}?card=${c.id}`}
                          className="hover:underline"
                        >
                          {c.title}
                          {c.archived_at
                            ? " · 보관됨"
                            : c.completed_at
                              ? " · 완료"
                              : " · 미완료"}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Section title="열린 질문" items={summary.openQuestions} />
              {summary.followups.length > 0 && (
                <Section
                  title="후속"
                  items={summary.followups.map(
                    (f) => `${f.title}${f.when ? ` (${f.when})` : ""}`,
                  )}
                />
              )}
              {summary.participants.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  참석: {summary.participants.join(", ")}
                </p>
              )}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {meeting.summary_md ?? "요약이 없어요."}
            </p>
          )
        ) : (
          <div className="space-y-2 text-sm">
            {speakers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 text-xs">
                {speakers.map((sp) => (
                  <Badge key={sp} asChild variant="outline">
                    <button type="button" onClick={() => renameSpeaker(sp)}>
                      {speakerMap[sp] ?? `화자 ${sp.replace(/^S/, "")}`} ✎
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            {Object.keys(meeting.transcript_edits as object).length > 0 && (
              <p className="text-xs text-muted-foreground">
                직접 정정한 전사를 유지하고 있어요. 이 내용을 기준으로 다시
                요약할 수 있어요.
              </p>
            )}
            {pass === "live" &&
              meeting.final_pass_status !== "skipped" &&
              meeting.final_pass_status !== "done" && (
                <p className="text-xs text-muted-foreground">
                  화자 분리 전 라이브 전사예요. 화자 분리가 끝나면 정식 전사로
                  바뀌어요.
                </p>
              )}
            {segments.map((s) => (
              <div
                id={`segment-${s.id}`}
                key={s.id}
                className={cn(
                  "flex gap-3 scroll-mt-24 rounded-md",
                  sourceAt !== null &&
                    s.start_ms <= sourceAt &&
                    s.end_ms >= sourceAt &&
                    "bg-accent",
                )}
              >
                <button
                  type="button"
                  className="w-12 shrink-0 pt-0.5 text-left text-xs tabular-nums text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    seekRecording(s.start_ms);
                  }}
                >
                  {fmtClock(s.start_ms)}
                </button>
                <div className="min-w-0 flex-1 leading-relaxed">
                  {s.speaker && (
                    <span className="mr-1 font-medium text-muted-foreground">
                      {speakerMap[s.speaker] ??
                        `화자 ${s.speaker.replace(/^S/, "")}`}
                    </span>
                  )}
                  <TranscriptText
                    meetingId={meeting.id}
                    segmentId={s.id}
                    text={s.text}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {reviewedFollowups.some(
          (f) => f.kind === "event" || f.kind === "reference",
        ) && (
          <section className="space-y-2 border-t pt-3 text-sm">
            <h3 className="font-medium">검토한 일정·참고</h3>
            {reviewedFollowups
              .filter(
                (f) =>
                  f.result_id && (f.kind === "event" || f.kind === "reference"),
              )
              .map((f) => (
                <p key={f.id}>
                  {f.kind === "event" ? (
                    <Link
                      className="underline underline-offset-2"
                      href={`/calendar?event=${f.result_id}`}
                    >
                      {(f.choice as { title?: string }).title ?? "일정 열기"}
                    </Link>
                  ) : (
                    <span>참고 · {(f.choice as { title?: string }).title}</span>
                  )}
                </p>
              ))}
          </section>
        )}
        <div className="flex justify-end pt-4">
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={remove}
          >
            <Trash2 className="size-4" /> 회의 삭제
          </Button>
        </div>
      </Page>
      {summary && (
        <ReviewSheet
          open={review}
          onClose={() => setReview(false)}
          meetingId={meeting.id}
          startedAt={meeting.started_at}
          timezone={DEFAULT_TZ}
          createdKeys={[
            ...linkedCards.flatMap((c) =>
              c.creation_key ? [c.creation_key] : [],
            ),
            ...reviewedFollowups
              .filter((f) => f.result_id)
              .map((f) => f.action_key),
          ]}
          items={summary.actionItems}
          followups={summary.followups}
          onDone={refresh}
        />
      )}
    </>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-1 font-medium">{title}</h3>
      <ul className="list-disc space-y-0.5 pl-5">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}
