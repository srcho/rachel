/**
 * 무음 경계 세그먼터. PCM 블록을 누적하다가 (길이 ≥ minSec 이고 silenceMs 연속 무음) 또는 길이 ≥ maxSec 에서 컷.
 * 전체가 무음이면 세그먼트를 버린다(과금 방지). 순수 함수형 — 브라우저·테스트 공용.
 */
export interface SegmenterOptions {
  sampleRate: number;
  minSec: number;
  maxSec: number;
  silenceMs: number;
  /** RMS(0~1) 임계. 16bit 기준 약 -45 dBFS */
  silenceRms: number;
  /** 세그먼트 전체 피크가 이 값 미만이면 무음 세그먼트로 버린다 */
  dropPeak: number;
}

export const DEFAULT_SEGMENTER: SegmenterOptions = {
  sampleRate: 16_000,
  minSec: 8,
  maxSec: 20,
  silenceMs: 600,
  silenceRms: 0.006,
  dropPeak: 0.02,
};

export interface Segment {
  seq: number;
  startMs: number;
  endMs: number;
  pcm: Int16Array;
  peak: number;
}

export function rms(block: Int16Array): number {
  let s = 0;
  for (let i = 0; i < block.length; i++) s += (block[i] ?? 0) * (block[i] ?? 0);
  return Math.sqrt(s / Math.max(1, block.length)) / 32768;
}

export class Segmenter {
  private chunks: Int16Array[] = [];
  private samples = 0;
  private silentSamples = 0;
  private peak = 0;
  private seq = 0;
  /** 현재 세그먼트 시작(회의 시작 기준 샘플) */
  private startSample = 0;
  private totalSamples = 0;

  constructor(
    private readonly opt: SegmenterOptions = DEFAULT_SEGMENTER,
    resume?: { nextSeq: number; elapsedMs: number },
  ) {
    this.seq = resume?.nextSeq ?? 0;
    this.startSample = Math.round(
      ((resume?.elapsedMs ?? 0) * opt.sampleRate) / 1000,
    );
    this.totalSamples = this.startSample;
  }

  /** 블록을 넣고, 컷이 발생하면 세그먼트를 돌려준다(무음 세그먼트는 null 로 버리되 시간은 진행). */
  push(block: Int16Array): Segment | null {
    this.chunks.push(block);
    this.samples += block.length;
    this.totalSamples += block.length;
    const r = rms(block);
    let p = 0;
    for (let i = 0; i < block.length; i++)
      p = Math.max(p, Math.abs(block[i] ?? 0));
    this.peak = Math.max(this.peak, p / 32768);
    this.silentSamples =
      r < this.opt.silenceRms ? this.silentSamples + block.length : 0;
    const sec = this.samples / this.opt.sampleRate;
    const silentMs = (this.silentSamples / this.opt.sampleRate) * 1000;
    if (
      (sec >= this.opt.minSec && silentMs >= this.opt.silenceMs) ||
      sec >= this.opt.maxSec
    )
      return this.cut();
    return null;
  }

  /** 종료 시 남은 것을 내보낸다. */
  flush(): Segment | null {
    if (this.samples === 0) return null;
    return this.cut();
  }

  private cut(): Segment | null {
    const pcm = new Int16Array(this.samples);
    let o = 0;
    for (const c of this.chunks) {
      pcm.set(c, o);
      o += c.length;
    }
    const seg: Segment = {
      seq: this.seq,
      startMs: Math.round((this.startSample / this.opt.sampleRate) * 1000),
      endMs: Math.round(
        ((this.startSample + this.samples) / this.opt.sampleRate) * 1000,
      ),
      pcm,
      peak: this.peak,
    };
    this.startSample += this.samples;
    this.chunks = [];
    this.samples = 0;
    this.silentSamples = 0;
    this.peak = 0;
    if (seg.peak < this.opt.dropPeak) return null; // 무음: seq 를 소비하지 않는다
    this.seq++;
    return seg;
  }
}
