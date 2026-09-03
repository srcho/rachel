"use client";
import { audioStore } from "./audio-store";
import { DEFAULT_SEGMENTER, rms, type Segment, Segmenter } from "./segmenter";
import { type UploadedTurn, Uploader } from "./uploader";

export type RecorderState =
  | "idle"
  | "requesting"
  | "recording"
  | "paused"
  | "ending"
  | "done"
  | "error";

export interface RecorderEvents {
  onState(state: RecorderState, error?: string): void;
  onLevel(rms: number): void;
  onSegmentQueued(seq: number, startMs: number, endMs: number): void;
  onTurns(seq: number, turns: UploadedTurn[], error?: string): void;
  onTick(elapsedMs: number): void;
}

const TARGET_RATE = 16_000;

/** 마이크 → (a) AudioWorklet PCM → 세그먼터 → 업로더, (b) MediaRecorder → IndexedDB. */
export class MeetingRecorder {
  state: RecorderState = "idle";
  private stream?: MediaStream;
  private ctx?: AudioContext;
  private node?: AudioWorkletNode;
  private media?: MediaRecorder;
  private segmenter = new Segmenter(DEFAULT_SEGMENTER);
  private uploader?: Uploader;
  private startedAt = 0;
  private pausedAccum = 0;
  private pausedAt = 0;
  private tick?: ReturnType<typeof setInterval>;
  private recIndex = 0;
  private wakeLock?: WakeLockSentinel;
  mime = "";

  constructor(
    private readonly meetingId: string,
    private readonly ev: RecorderEvents,
  ) {}

  async start(): Promise<void> {
    this.setState("requesting");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
      this.ctx = new AudioContext({ sampleRate: TARGET_RATE });
      await this.ctx.audioWorklet.addModule("/worklets/pcm-capture.js");
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.node = new AudioWorkletNode(this.ctx, "pcm-capture", {
        processorOptions: { targetRate: TARGET_RATE },
      });
      this.node.port.onmessage = (e: MessageEvent<ArrayBuffer>) =>
        this.onBlock(new Int16Array(e.data));
      src.connect(this.node);
      // 워클릿 출력은 스피커로 보내지 않는다(연결하지 않음)

      this.uploader = new Uploader(
        this.meetingId,
        TARGET_RATE,
        (seq, turns, err) => this.ev.onTurns(seq, turns, err),
      );
      this.startMediaRecorder();
      await audioStore.persist();
      await this.requestWakeLock();
      document.addEventListener("visibilitychange", this.onVisibility);

      this.startedAt = Date.now();
      this.tick = setInterval(() => this.ev.onTick(this.elapsed()), 500);
      this.setState("recording");
    } catch (e) {
      this.setState("error", e instanceof Error ? e.message : String(e));
      await this.cleanup();
    }
  }

  private startMediaRecorder() {
    if (!this.stream || typeof MediaRecorder === "undefined") return;
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/aac",
    ];
    this.mime = candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    try {
      this.media = new MediaRecorder(
        this.stream,
        this.mime
          ? { mimeType: this.mime, audioBitsPerSecond: 32_000 }
          : undefined,
      );
      this.mime = this.media.mimeType || this.mime;
      this.media.ondataavailable = (e) => {
        if (e.data.size > 0)
          void audioStore.appendRec(
            this.meetingId,
            this.recIndex++,
            e.data,
            this.mime,
          );
      };
      this.media.start(10_000);
    } catch (e) {
      console.warn("[recorder] MediaRecorder 사용 불가", e);
    }
  }

  private onBlock(block: Int16Array) {
    if (this.state !== "recording") return;
    this.ev.onLevel(rms(block));
    const seg = this.segmenter.push(block);
    if (seg) this.queue(seg);
  }

  private queue(seg: Segment) {
    this.ev.onSegmentQueued(seg.seq, seg.startMs, seg.endMs);
    void this.uploader?.enqueue(seg);
  }

  pause() {
    if (this.state !== "recording") return;
    this.pausedAt = Date.now();
    this.media?.pause();
    this.setState("paused");
  }
  resume() {
    if (this.state !== "paused") return;
    this.pausedAccum += Date.now() - this.pausedAt;
    this.media?.resume();
    this.setState("recording");
  }

  elapsed(): number {
    if (!this.startedAt) return 0;
    const pausedNow = this.state === "paused" ? Date.now() - this.pausedAt : 0;
    return Date.now() - this.startedAt - this.pausedAccum - pausedNow;
  }

  /** 마지막 세그먼트를 내보내고 업로드가 끝날 때까지 기다린다. */
  async stop(): Promise<{ durationSec: number; mime: string }> {
    this.setState("ending");
    const durationSec = Math.round(this.elapsed() / 1000);
    const last = this.segmenter.flush();
    if (last) this.queue(last);
    await this.stopMedia();
    await this.uploader?.drain();
    this.uploader?.stop();
    await this.cleanup();
    this.setState("done");
    return { durationSec, mime: this.mime };
  }

  private stopMedia(): Promise<void> {
    return new Promise((resolve) => {
      const m = this.media;
      if (!m || m.state === "inactive") return resolve();
      m.onstop = () => resolve();
      m.stop();
      setTimeout(resolve, 3000);
    });
  }

  private async cleanup() {
    if (this.tick) clearInterval(this.tick);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.node?.disconnect();
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    await this.ctx?.close().catch(() => {});
    await this.wakeLock?.release().catch(() => {});
  }

  private async requestWakeLock() {
    try {
      this.wakeLock = await navigator.wakeLock?.request("screen");
    } catch {
      /* 미지원 */
    }
  }
  private onVisibility = () => {
    if (document.visibilityState === "visible") void this.requestWakeLock();
  };

  private setState(s: RecorderState, error?: string) {
    this.state = s;
    this.ev.onState(s, error);
  }
}
