"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { encodeWav } from "@/core/transcription/wav";
import { audioStore } from "../recorder/audio-store";
import type { MeetingRow } from "../repository";
import {
  DEFAULT_CHUNK,
  type PcmPiece,
  planChunks,
  samplesInWav,
} from "./chunker";

const RATE = DEFAULT_CHUNK.sampleRate;
/** 인스턴스당 동시 실행 방지 */
const running = new Set<string>();

/**
 * 파이널 패스 러너(클라이언트). 기기의 PCM 세그먼트를 청크로 묶어 /diarize 에 순차 업로드한다.
 * pending 상태이고 이 기기에 PCM 이 있으면 자동 시작. 완료 후 PCM 삭제.
 */
export function useFinalPass(meeting: MeetingRow) {
  const router = useRouter();
  const [status, setStatus] = useState(meeting.final_pass_status);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(
    (meeting.final_pass_progress as { done: number; total: number }) ?? null,
  );
  const startedRef = useRef(false);

  const run = useCallback(async () => {
    if (running.has(meeting.id)) return;
    running.add(meeting.id);
    try {
      const pcms = await audioStore.listPcm(meeting.id);
      if (pcms.length === 0) return; // 다른 기기에서 녹음됨
      setStatus("running");
      // 계획은 메타(바이트 수)만으로 세운다 — 회의 전체 PCM(시간당 ≈115MB)을 메모리에 올리지 않는다
      const pieces: PcmPiece[] = pcms.map((p) => ({
        seq: p.seq,
        startMs: p.startMs,
        endMs: p.endMs,
        samples: samplesInWav(p.blob.size),
      }));
      const plans = planChunks(pieces);
      setProgress({ done: 0, total: plans.length });
      for (const plan of plans) {
        // 청크에 필요한 세그먼트만 IndexedDB 에서 읽어 조립하고, 업로드 뒤 버린다(최대 ≈ 청크 1개 + WAV 사본)
        const out = new Int16Array(plan.totalSamples);
        let o = 0;
        for (const pc of plan.pieces) {
          const rec = await audioStore.getPcm(meeting.id, pc.seq);
          if (!rec) continue;
          const buf = await rec.blob.arrayBuffer();
          const src = new Int16Array(buf, 44, samplesInWav(buf.byteLength));
          const len = Math.min(pc.sliceEnd, src.length) - pc.sliceStart;
          if (len > 0)
            out.set(src.subarray(pc.sliceStart, pc.sliceStart + len), o);
          o += Math.max(0, len);
        }
        const form = new FormData();
        form.append(
          "meta",
          JSON.stringify({
            chunkIndex: plan.chunkIndex,
            chunkCount: plans.length,
            offsetTable: plan.pieces.map((p) => ({
              chunkMs: p.chunkMs,
              meetingMs: p.meetingMs,
            })),
          }),
        );
        form.append(
          "audio",
          encodeWav(out, RATE),
          `chunk-${plan.chunkIndex}.wav`,
        );
        let ok = false;
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
          const res = await fetch(`/api/meetings/${meeting.id}/diarize`, {
            method: "POST",
            body: form,
          });
          ok = res.ok;
          if (!ok) await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
        }
        if (!ok) {
          setStatus("failed");
          return;
        }
        setProgress({ done: plan.chunkIndex + 1, total: plans.length });
      }
      setStatus("done");
      await audioStore.deletePcm(meeting.id);
      router.refresh();
    } catch (e) {
      console.error("[finalpass]", e);
      setStatus("failed");
    } finally {
      running.delete(meeting.id);
    }
  }, [meeting.id, router]);

  useEffect(() => {
    if (startedRef.current) return;
    if (
      meeting.final_pass_status === "pending" &&
      meeting.status !== "recording"
    ) {
      startedRef.current = true;
      void run();
    }
  }, [meeting.final_pass_status, meeting.status, run]);

  return { status, progress, retry: run };
}
