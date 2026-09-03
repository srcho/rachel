import { describe, expect, it } from "vitest";
import { DEFAULT_SEGMENTER, Segmenter } from "../recorder/segmenter";

const RATE = 16_000;
function tone(sec: number, amp = 0.3): Int16Array {
  const n = Math.round(sec * RATE);
  const a = new Int16Array(n);
  for (let i = 0; i < n; i++)
    a[i] = Math.round(Math.sin((2 * Math.PI * 300 * i) / RATE) * amp * 32767);
  return a;
}
const silence = (sec: number) => new Int16Array(Math.round(sec * RATE));
function feed(seg: Segmenter, pcm: Int16Array, block = 2048) {
  const out = [];
  for (let i = 0; i < pcm.length; i += block) {
    const s = seg.push(pcm.subarray(i, Math.min(pcm.length, i + block)));
    if (s) out.push(s);
  }
  return out;
}

describe("Segmenter", () => {
  it("cuts at a silence boundary after minSec", () => {
    const seg = new Segmenter(DEFAULT_SEGMENTER);
    const out = feed(seg, concat(tone(9), silence(1), tone(3)));
    expect(out).toHaveLength(1);
    expect(out[0]?.startMs).toBe(0);
    expect(out[0]?.endMs).toBeGreaterThanOrEqual(9600);
    expect(out[0]?.endMs).toBeLessThan(10_200);
    const rest = seg.flush();
    expect(rest?.seq).toBe(1);
    expect(rest?.startMs).toBe(out[0]?.endMs);
  });
  it("forces a cut at maxSec without silence", () => {
    const seg = new Segmenter(DEFAULT_SEGMENTER);
    const out = feed(seg, tone(45));
    expect(out.map((s) => Math.round((s.endMs - s.startMs) / 1000))).toEqual([
      20, 20,
    ]);
    expect(seg.flush()?.seq).toBe(2);
  });
  it("drops all-silent segments but keeps the meeting clock", () => {
    const seg = new Segmenter(DEFAULT_SEGMENTER);
    const out = feed(seg, concat(silence(25), tone(9), silence(1)));
    expect(out).toHaveLength(1);
    expect(out[0]?.seq).toBe(0);
    expect(out[0]?.startMs).toBeGreaterThanOrEqual(20_000);
  });
});

function concat(...parts: Int16Array[]): Int16Array {
  const out = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
