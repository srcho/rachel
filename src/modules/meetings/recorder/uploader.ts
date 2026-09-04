"use client";
import { encodeWav } from "@/core/transcription/wav";
import { audioStore } from "./audio-store";
import type { Segment } from "./segmenter";

export interface UploadedTurn {
  id: string;
  seq: number;
  start_ms: number;
  end_ms: number;
  text: string;
  status: "ok" | "failed";
}

interface QueueItem {
  seg: Segment;
  wav: Blob;
  attempts: number;
}

/**
 * 세그먼트 업로드 큐(동시 2, 지수 백오프 3회, 오프라인이면 대기).
 * WAV 는 먼저 IndexedDB 에 보관하고 업로드한다(앱이 죽어도 재전송 가능).
 */
export class Uploader {
  private queue: QueueItem[] = [];
  private active = 0;
  private stopped = false;

  constructor(
    private readonly meetingId: string,
    private readonly sampleRate: number,
    private readonly onResult: (
      seq: number,
      turns: UploadedTurn[],
      error?: string,
    ) => void,
    private readonly concurrency = 2,
  ) {
    if (typeof window !== "undefined")
      window.addEventListener("online", () => this.pump());
  }

  async enqueue(seg: Segment): Promise<void> {
    const wav = encodeWav(seg.pcm, this.sampleRate);
    try {
      await audioStore.putPcm(
        this.meetingId,
        seg.seq,
        seg.startMs,
        seg.endMs,
        wav,
      );
    } catch (e) {
      // IndexedDB 실패(프라이빗 모드·용량)여도 전사는 계속한다 — 파이널 패스 오디오만 빠진다
      console.warn("[uploader] PCM 저장 실패", seg.seq, e);
    }
    this.queue.push({ seg, wav, attempts: 0 });
    this.pump();
  }

  /** 대기 중·진행 중 개수 */
  pending(): number {
    return this.queue.length + this.active;
  }

  stop(): void {
    this.stopped = true;
  }

  /** 모두 끝날 때까지 기다린다(종료 시). */
  async drain(timeoutMs = 60_000): Promise<void> {
    const until = Date.now() + timeoutMs;
    while (this.pending() > 0 && Date.now() < until)
      await new Promise((r) => setTimeout(r, 200));
  }

  private pump(): void {
    if (this.stopped) return;
    while (
      this.active < this.concurrency &&
      this.queue.length > 0 &&
      navigator.onLine !== false
    ) {
      const item = this.queue.shift();
      if (!item) break;
      this.active++;
      void this.send(item).finally(() => {
        this.active--;
        this.pump();
      });
    }
  }

  private async send(item: QueueItem): Promise<void> {
    const { seg } = item;
    try {
      const form = new FormData();
      form.append("audio", item.wav, `${seg.seq}.wav`);
      form.append("seq", String(seg.seq));
      form.append("startMs", String(seg.startMs));
      form.append("endMs", String(seg.endMs));
      const res = await fetch(`/api/meetings/${this.meetingId}/segments`, {
        method: "POST",
        body: form,
      });
      if (!res.ok)
        throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`);
      const json = (await res.json()) as { turns: UploadedTurn[] };
      this.onResult(seg.seq, json.turns);
    } catch (e) {
      item.attempts++;
      if (item.attempts < 3) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** item.attempts));
        this.queue.unshift(item);
      } else {
        this.onResult(seg.seq, [], e instanceof Error ? e.message : String(e));
      }
    }
  }
}
