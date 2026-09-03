import { describe, expect, it } from "vitest";
import {
  chunkToMeetingMs,
  DEFAULT_CHUNK,
  planChunks,
} from "../finalpass/chunker";
import { stitch } from "../stitch";

const R = 16_000;

describe("planChunks", () => {
  it("returns one chunk for short meetings and keeps meeting offsets", () => {
    const pieces = [
      { seq: 0, startMs: 0, endMs: 20_000, samples: 20 * R },
      { seq: 1, startMs: 25_000, endMs: 40_000, samples: 15 * R }, // 5초 무음 생략
    ];
    const plans = planChunks(pieces);
    expect(plans).toHaveLength(1);
    expect(plans[0]?.pieces.map((p) => [p.chunkMs, p.meetingMs])).toEqual([
      [0, 0],
      [20_000, 25_000],
    ]);
    const table =
      plans[0]?.pieces.map((p) => ({
        chunkMs: p.chunkMs,
        meetingMs: p.meetingMs,
      })) ?? [];
    expect(chunkToMeetingMs(table, 10_000)).toBe(10_000);
    expect(chunkToMeetingMs(table, 22_000)).toBe(27_000);
  });
  it("splits a 60-minute meeting into overlapping chunks under the limit", () => {
    const pieces = Array.from({ length: 180 }, (_, i) => ({
      seq: i,
      startMs: i * 20_000,
      endMs: i * 20_000 + 20_000,
      samples: 20 * R,
    }));
    const plans = planChunks(pieces);
    expect(plans.length).toBe(7);
    for (const p of plans)
      expect(p.totalSamples).toBeLessThanOrEqual(DEFAULT_CHUNK.maxSec * R);
    // 두 번째 청크는 540초 지점에서 시작(30초 겹침)
    expect(plans[1]?.pieces[0]?.meetingMs).toBe(540_000);
  });
  it("merges a too-short last chunk into the previous one", () => {
    const pieces = Array.from({ length: 30 }, (_, i) => ({
      seq: i,
      startMs: i * 20_000,
      endMs: i * 20_000 + 20_000,
      samples: 20 * R,
    })); // 600s
    const plans = planChunks(pieces);
    expect(plans).toHaveLength(1);
    expect(plans[0]?.totalSamples).toBe(600 * R);
  });
});

describe("stitch", () => {
  it("maps swapped labels across chunks using the overlap and dedupes boundary turns", () => {
    // 청크0: 0~570s, 청크1: 540~1110s. 청크1에서는 A/B 가 뒤바뀜.
    const turns = [
      {
        chunkIndex: 0,
        rawSpeaker: "A",
        startMs: 0,
        endMs: 300_000,
        text: "a1",
        turnId: 1,
      },
      {
        chunkIndex: 0,
        rawSpeaker: "B",
        startMs: 300_000,
        endMs: 545_000,
        text: "b1",
        turnId: 2,
      },
      {
        chunkIndex: 0,
        rawSpeaker: "A",
        startMs: 545_000,
        endMs: 570_000,
        text: "a2-overlap",
        turnId: 3,
      },
      {
        chunkIndex: 1,
        rawSpeaker: "B",
        startMs: 540_000,
        endMs: 545_000,
        text: "b1-tail",
        turnId: 1,
      },
      {
        chunkIndex: 1,
        rawSpeaker: "A",
        startMs: 545_000,
        endMs: 570_000,
        text: "a2-overlap-dup",
        turnId: 2,
      },
      {
        chunkIndex: 1,
        rawSpeaker: "B",
        startMs: 570_000,
        endMs: 800_000,
        text: "b2",
        turnId: 3,
      },
      {
        chunkIndex: 1,
        rawSpeaker: "C",
        startMs: 800_000,
        endMs: 900_000,
        text: "c1",
        turnId: 4,
      },
    ];
    const r = stitch(turns, 30_000);
    expect(r.mapping[0]).toEqual({ A: "S1", B: "S2" });
    expect(r.mapping[1]?.A).toBe("S1");
    expect(r.mapping[1]?.B).toBe("S2");
    expect(r.mapping[1]?.C).toBe("S3");
    // 겹침 중앙(555s) 이후 turn 은 뒤 청크 것을 쓴다
    expect(r.turns.map((t) => t.text)).toEqual([
      "a1",
      "b1",
      "a2-overlap-dup",
      "b2",
      "c1",
    ]);
  });
});
