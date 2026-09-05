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
  private offsetMs = 0;
  private sessionId = crypto.randomUUID();
  private cancelled = false;
  private starting?: Promise<void>;
  private stopping?: Promise<{ durationSec: number; mime: string }>;
  private writes = new Set<Promise<void>>();
  private writeError?: Error;
  private releaseLock?: () => void;
  private wakeLock?: WakeLockSentinel;
  mime = "";

  constructor(
    private readonly meetingId: string,
    private readonly ev: RecorderEvents,
  ) {}

  start(): Promise<void> {
    this.starting ??= this.startCapture();
    return this.starting;
  }

  private async startCapture(): Promise<void> {
    this.setState("requesting");
    try {
      if (navigator.locks) {
        await new Promise<void>((resolve, reject) => {
          void navigator.locks
            .request(
              `rachel-recording:${this.meetingId}`,
              { ifAvailable: true },
              async (lock) => {
                if (!lock) {
                  reject(new Error("이 회의가 다른 화면에서 녹음 중이에요"));
                  return;
                }
                await new Promise<void>((release) => {
                  this.releaseLock = release;
                  resolve();
                });
              },
            )
            .catch(reject);
        });
      }
      const resume = await audioStore.resumeInfo(this.meetingId);
      this.offsetMs = resume.elapsedMs;
      this.recIndex = resume.nextRecIndex;
      this.segmenter = new Segmenter(DEFAULT_SEGMENTER, resume);
      this.ev.onTick(this.offsetMs);
      if (this.cancelled) {
        await this.cleanup();
        return;
      }
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
      if (this.cancelled) {
        await this.cleanup();
        return;
      }
      this.ctx = new AudioContext({ sampleRate: TARGET_RATE });
      // iOS 는 제스처 밖에서 만든 컨텍스트를 suspended 로 둔다
      if (this.ctx.state !== "running") await this.ctx.resume().catch(() => {});
      await this.ctx.audioWorklet.addModule("/worklets/pcm-capture.js");
      if (this.cancelled) {
        await this.cleanup();
        return;
      }
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
      this.startedAt = Date.now();
      this.startMediaRecorder();
      await audioStore.persist();
      await this.requestWakeLock();
      document.addEventListener("visibilitychange", this.onVisibility);

      if (this.cancelled) {
        await this.stopMedia();
        await this.cleanup();
        return;
      }
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
          this.trackWrite(
            audioStore.appendRec(
              this.meetingId,
              this.recIndex++,
              e.data,
              this.mime,
              {
                sessionId: this.sessionId,
                startMs: this.offsetMs,
                endMs: this.elapsed(),
              },
            ),
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
    if (this.uploader) this.trackWrite(this.uploader.enqueue(seg));
  }

  /** 일시정지: 전사 입력을 끊고(onBlock 무시) 오디오 컨텍스트를 재운다. 마이크 트랙은 유지(재개가 빨라야 한다). */
  async pause(): Promise<void> {
    if (this.state !== "recording") return;
    this.pausedAt = Date.now();
    this.setState("paused");
    try {
      if (this.media?.state === "recording") this.media.pause();
    } catch (e) {
      console.warn("[recorder] MediaRecorder.pause 실패", e);
    }
    await this.ctx?.suspend().catch(() => {});
  }
  async resume(): Promise<void> {
    if (this.state !== "paused") return;
    this.pausedAccum += Date.now() - this.pausedAt;
    await this.ctx?.resume().catch(() => {});
    try {
      if (this.media?.state === "paused") this.media.resume();
    } catch (e) {
      console.warn("[recorder] MediaRecorder.resume 실패", e);
    }
    await this.requestWakeLock();
    this.setState("recording");
  }

  elapsed(): number {
    if (!this.startedAt) return this.offsetMs;
    const pausedNow = this.state === "paused" ? Date.now() - this.pausedAt : 0;
    return (
      this.offsetMs + Date.now() - this.startedAt - this.pausedAccum - pausedNow
    );
  }

  /** 마지막 세그먼트를 내보내고 업로드가 끝날 때까지 기다린다. */
  stop(): Promise<{ durationSec: number; mime: string }> {
    this.cancelled = true;
    this.stopping ??= this.finish();
    return this.stopping;
  }

  private async finish(): Promise<{ durationSec: number; mime: string }> {
    await this.starting;
    if (this.state === "paused") this.pausedAccum += Date.now() - this.pausedAt;
    await this.ctx?.resume().catch(() => {});
    this.setState("ending");
    const durationSec = Math.round(this.elapsed() / 1000);
    const last = this.segmenter.flush();
    if (last) this.queue(last);
    try {
      await this.stopMedia();
      await Promise.all(this.writes);
      if (this.writeError) throw this.writeError;
      await this.uploader?.drain();
      this.setState("done");
      return { durationSec, mime: this.mime };
    } catch (e) {
      this.setState("error", e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      this.uploader?.stop();
      await this.cleanup();
    }
  }

  private trackWrite(write: Promise<void>) {
    const pending = write
      .catch((e) => {
        this.writeError = new Error(
          `기기에 녹음을 저장하지 못했어요: ${e instanceof Error ? e.message : String(e)}`,
        );
        void this.pause().then(() =>
          this.ev.onState(this.state, this.writeError?.message),
        );
      })
      .finally(() => this.writes.delete(pending));
    this.writes.add(pending);
  }

  private stopMedia(): Promise<void> {
    return new Promise((resolve, reject) => {
      const m = this.media;
      if (!m || m.state === "inactive") return resolve();
      const timeout = setTimeout(
        () =>
          reject(
            new Error(
              "마지막 녹음 저장을 확인하지 못했어요. 저장된 분량은 이 기기에 남아 있어요.",
            ),
          ),
        3000,
      );
      m.onstop = () => {
        clearTimeout(timeout);
        resolve();
      };
      m.stop();
    });
  }

  private async cleanup() {
    if (this.tick) clearInterval(this.tick);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.node?.disconnect();
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    await this.ctx?.close().catch(() => {});
    await this.wakeLock?.release().catch(() => {});
    this.releaseLock?.();
    this.releaseLock = undefined;
  }

  private async requestWakeLock() {
    try {
      this.wakeLock = await navigator.wakeLock?.request("screen");
    } catch {
      /* 미지원 */
    }
  }
  private onVisibility = () => {
    if (document.visibilityState !== "visible") return;
    void this.requestWakeLock();
    // iOS 가 백그라운드에서 컨텍스트를 멈춘 경우 되살린다
    if (this.state === "recording" && this.ctx?.state !== "running")
      void this.ctx?.resume().catch(() => {});
  };

  private setState(s: RecorderState, error?: string) {
    this.state = s;
    this.ev.onState(s, error);
  }
}
