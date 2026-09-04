/**
 * 파이널 패스 청킹. 라이브 PCM 세그먼트(시간순)를 이어 붙여 Muse 배치 한도(10분·32MB) 안의 청크를 만든다.
 * 세그먼트 사이 생략된 무음은 채우지 않고 offsetTable 로 청크 시간 → 회의 시간을 매핑한다.
 */
export interface PcmPiece {
  seq: number;
  startMs: number;
  endMs: number;
  samples: number; // PCM 샘플 수
}
export interface ChunkPlan {
  chunkIndex: number;
  pieces: Array<{
    seq: number;
    sliceStart: number;
    sliceEnd: number;
    chunkMs: number;
    meetingMs: number;
  }>;
  totalSamples: number;
}
export interface ChunkOptions {
  sampleRate: number;
  chunkSec: number; // 570
  overlapSec: number; // 30
  minLastSec: number; // 60 — 마지막 청크가 이보다 짧으면 앞 청크에 합친다(≤ maxSec 일 때)
  maxSec: number; // 600
}
export const DEFAULT_CHUNK: ChunkOptions = {
  sampleRate: 16_000,
  chunkSec: 570,
  overlapSec: 30,
  minLastSec: 60,
  maxSec: 600,
};

/** 세그먼트 목록 → 청크 계획(샘플 단위 슬라이스). 겹침은 앞 청크의 마지막 overlapSec 만큼을 다음 청크 앞에 다시 넣는다. */
export function planChunks(
  pieces: PcmPiece[],
  opt: ChunkOptions = DEFAULT_CHUNK,
): ChunkPlan[] {
  const total = pieces.reduce((n, p) => n + p.samples, 0);
  const chunkS = opt.chunkSec * opt.sampleRate;
  const stepS = (opt.chunkSec - opt.overlapSec) * opt.sampleRate;
  if (total === 0) return [];
  // 연속 타임라인(생략 무음 제외)에서의 청크 시작 오프셋들
  const starts: number[] = [];
  for (
    let s = 0;
    s === 0 || s + opt.overlapSec * opt.sampleRate < total;
    s += stepS
  )
    starts.push(s);
  // 마지막 청크가 너무 짧으면 앞 청크와 합친다(한도 안에서)
  if (starts.length > 1) {
    const lastLen = total - (starts[starts.length - 1] ?? 0);
    const prevLen = total - (starts[starts.length - 2] ?? 0);
    if (
      lastLen <= opt.minLastSec * opt.sampleRate &&
      prevLen <= opt.maxSec * opt.sampleRate
    )
      starts.pop();
  }
  const plans: ChunkPlan[] = [];
  starts.forEach((start, chunkIndex) => {
    const end = Math.min(
      total,
      chunkIndex === starts.length - 1 ? total : start + chunkS,
    );
    const plan: ChunkPlan = {
      chunkIndex,
      pieces: [],
      totalSamples: end - start,
    };
    let cursor = 0; // 연속 타임라인 오프셋
    let chunkPos = 0;
    for (const p of pieces) {
      const pStart = cursor;
      const pEnd = cursor + p.samples;
      cursor = pEnd;
      if (pEnd <= start || pStart >= end) continue;
      const sliceStart = Math.max(0, start - pStart);
      const sliceEnd = Math.min(p.samples, end - pStart);
      const meetingMs =
        p.startMs + Math.round((sliceStart / opt.sampleRate) * 1000);
      plan.pieces.push({
        seq: p.seq,
        sliceStart,
        sliceEnd,
        chunkMs: Math.round((chunkPos / opt.sampleRate) * 1000),
        meetingMs,
      });
      chunkPos += sliceEnd - sliceStart;
    }
    plans.push(plan);
  });
  return plans;
}

/** 청크 내부 ms → 회의 ms (offsetTable 은 chunkMs 오름차순) */
export function chunkToMeetingMs(
  table: Array<{ chunkMs: number; meetingMs: number }>,
  chunkMs: number,
): number {
  let row = table[0];
  for (const t of table) {
    if (t.chunkMs <= chunkMs) row = t;
    else break;
  }
  if (!row) return chunkMs;
  return row.meetingMs + (chunkMs - row.chunkMs);
}

/** WAV(16-bit mono, 44바이트 헤더) 바이트 수 → 샘플 수. 계획 단계에서 blob 을 읽지 않기 위해 */
export function samplesInWav(bytes: number): number {
  return Math.max(0, Math.floor((bytes - 44) / 2));
}
