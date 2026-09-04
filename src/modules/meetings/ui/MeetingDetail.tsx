"use client";
import { ListChecks, MessageSquare, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

interface Props {
  meeting: MeetingRow;
  pass: "live" | "final";
  segments: SegmentRow[];
  costs: Record<string, number>;
  linkedCards: Array<{
    id: string;
    title: string;
    completed_at: string | null;
  }>;
  userId: string;
}

export function MeetingDetail({
  meeting,
  pass,
  segments,
  costs,
  linkedCards,
  userId,
}: Props) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  useTableChanges(["meetings", "transcript_segments"], userId, refresh);
  const [tab, setTab] = useState<"summary" | "transcript">("summary");
  const [review, setReview] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const summary = meeting.summary as MeetingSummary | null;
  const speakerMap = (meeting.speaker_map as Record<string, string>) ?? {};
  const finalPass = useFinalPass(meeting);
  const dock = useDock();

  useEffect(() => {
    let url: string | null = null;
    void audioStore.getRecording(meeting.id).then((blob) => {
      if (blob) {
        url = URL.createObjectURL(blob);
        setAudioUrl(url);
      }
    });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [meeting.id]);

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

        {audioUrl ? (
          // biome-ignore lint/a11y/useMediaCaption: 회의 녹음(자막은 전사 탭)
          <audio
            ref={setAudioEl}
            src={audioUrl}
            controls
            className="w-full"
            preload="metadata"
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            이 기기에 녹음 파일이 없어요(녹음한 기기에서만 재생돼요).
          </p>
        )}

        <div className="flex gap-1 border-b text-sm">
          {(["summary", "transcript"] as const).map((t) => (
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
              {t === "summary" ? "요약" : `전사 (${segments.length})`}
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
              <p className="text-base leading-relaxed">{summary.tldr}</p>
              <Section title="핵심" items={summary.keyPoints} />
              <Section title="결정" items={summary.decisions} />
              {summary.actionItems.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <h3 className="font-medium">액션 아이템</h3>
                    <Button size="sm" onClick={() => setReview(true)}>
                      <ListChecks className="size-4" /> 카드로 만들기
                    </Button>
                  </div>
                  <ul className="list-disc space-y-0.5 pl-5">
                    {summary.actionItems.map((a) => (
                      <li key={a.title}>
                        {a.title}
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
                  <h3 className="mb-1 font-medium">연결된 카드</h3>
                  <ul className="space-y-0.5">
                    {linkedCards.map((c) => (
                      <li
                        key={c.id}
                        className={cn(
                          c.completed_at &&
                            "line-through text-muted-foreground",
                        )}
                      >
                        <Link href="/tasks" className="hover:underline">
                          {c.title}
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
            {pass === "live" &&
              meeting.final_pass_status !== "skipped" &&
              meeting.final_pass_status !== "done" && (
                <p className="text-xs text-muted-foreground">
                  화자 분리 전 라이브 전사예요. 화자 분리가 끝나면 정식 전사로
                  바뀌어요.
                </p>
              )}
            {segments.map((s) => (
              <div key={s.id} className="flex gap-3">
                <button
                  type="button"
                  className="w-12 shrink-0 pt-0.5 text-left text-xs tabular-nums text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    if (audioEl) {
                      audioEl.currentTime = s.start_ms / 1000;
                      void audioEl.play();
                    }
                  }}
                >
                  {fmtClock(s.start_ms)}
                </button>
                <p className="leading-relaxed">
                  {s.speaker && (
                    <span className="mr-1 font-medium text-muted-foreground">
                      {speakerMap[s.speaker] ??
                        `화자 ${s.speaker.replace(/^S/, "")}`}
                    </span>
                  )}
                  {s.text}
                </p>
              </div>
            ))}
          </div>
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
