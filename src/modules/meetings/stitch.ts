/**
 * 청크 간 화자 라벨 스티칭. 겹침 구간(회의 시간 기준)에서 turn 시간 겹침 행렬로 라벨을 잇는다.
 * 순수 함수 — 서버·테스트 공용.
 */
export interface FinalTurn {
  chunkIndex: number;
  rawSpeaker: string;
  startMs: number;
  endMs: number;
  text: string;
  turnId: number;
}

export interface StitchResult {
  /** chunkIndex → rawSpeaker → 전역 라벨(S1, S2…) */
  mapping: Record<number, Record<string, string>>;
  /** 겹침 중복을 제거한 최종 turn 목록(전역 speaker 포함) */
  turns: Array<FinalTurn & { speaker: string }>;
}

export function stitch(turns: FinalTurn[], overlapMs: number): StitchResult {
  const chunks = [...new Set(turns.map((t) => t.chunkIndex))].sort(
    (a, b) => a - b,
  );
  const mapping: Record<number, Record<string, string>> = {};
  let next = 1;
  const label = () => `S${next++}`;
  const byChunk = (c: number) => turns.filter((t) => t.chunkIndex === c);

  for (const [i, c] of chunks.entries()) {
    mapping[c] = {};
    const cur = byChunk(c);
    if (i === 0) {
      for (const t of cur)
        if (!mapping[c]?.[t.rawSpeaker])
          (mapping[c] as Record<string, string>)[t.rawSpeaker] = label();
      continue;
    }
    const prev = chunks[i - 1] as number;
    const prevTurns = byChunk(prev);
    const prevEnd = Math.max(...prevTurns.map((t) => t.endMs), 0);
    const overlapStart = prevEnd - overlapMs;
    // 겹침 행렬: raw(prev) x raw(cur) → 겹친 ms
    const matrix = new Map<string, number>();
    for (const a of prevTurns) {
      if (a.endMs < overlapStart) continue;
      for (const b of cur) {
        if (b.startMs > prevEnd) continue;
        const ov = Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs);
        if (ov <= 0) continue;
        const k = `${a.rawSpeaker}|${b.rawSpeaker}`;
        matrix.set(k, (matrix.get(k) ?? 0) + ov);
      }
    }
    const usedPrev = new Set<string>();
    const usedCur = new Set<string>();
    for (const [k] of [...matrix.entries()].sort((x, y) => y[1] - x[1])) {
      const [pa, cb] = k.split("|") as [string, string];
      if (usedPrev.has(pa) || usedCur.has(cb)) continue;
      const global = mapping[prev]?.[pa];
      if (!global) continue;
      (mapping[c] as Record<string, string>)[cb] = global;
      usedPrev.add(pa);
      usedCur.add(cb);
    }
    for (const t of cur)
      if (!mapping[c]?.[t.rawSpeaker])
        (mapping[c] as Record<string, string>)[t.rawSpeaker] = label();
  }

  // 겹침 중복 제거: 경계(겹침 중앙) 기준 — 앞 청크는 경계 이전 turn, 뒤 청크는 경계 이후 turn
  const out: StitchResult["turns"] = [];
  for (const [i, c] of chunks.entries()) {
    const cur = byChunk(c);
    const prevEnd =
      i > 0
        ? Math.max(...byChunk(chunks[i - 1] as number).map((t) => t.endMs), 0)
        : -1;
    const nextStart =
      i < chunks.length - 1
        ? Math.min(
            ...byChunk(chunks[i + 1] as number).map((t) => t.startMs),
            Number.POSITIVE_INFINITY,
          )
        : Number.POSITIVE_INFINITY;
    const lowerBoundary = i > 0 ? prevEnd - overlapMs / 2 : -1;
    const upperBoundary =
      i < chunks.length - 1
        ? nextStart + overlapMs / 2
        : Number.POSITIVE_INFINITY;
    for (const t of cur) {
      const mid = (t.startMs + t.endMs) / 2;
      if (mid < lowerBoundary || mid >= upperBoundary) continue;
      out.push({ ...t, speaker: mapping[c]?.[t.rawSpeaker] ?? "S?" });
    }
  }
  out.sort((a, b) => a.startMs - b.startMs);
  return { mapping, turns: out };
}
