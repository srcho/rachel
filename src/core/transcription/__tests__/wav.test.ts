import { describe, expect, it } from "vitest";
import { assertMuseWav, encodeWav, parseWavHeader } from "../wav";

function tone(seconds: number, rate = 16_000): Int16Array {
  const n = Math.round(seconds * rate);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++)
    pcm[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000);
  return pcm;
}

describe("wav", () => {
  it("round-trips header info", async () => {
    const blob = encodeWav(tone(1.5), 16_000);
    const info = parseWavHeader(await blob.arrayBuffer());
    expect(info).toMatchObject({
      sampleRate: 16_000,
      channels: 1,
      bitsPerSample: 16,
    });
    expect(info.durationSec).toBeCloseTo(1.5, 3);
    expect(blob.size).toBe(44 + 1.5 * 16_000 * 2);
  });

  it("rejects non-wav and enforces Muse limits", async () => {
    expect(() => parseWavHeader(new ArrayBuffer(10))).toThrow();
    const info = parseWavHeader(await encodeWav(tone(2), 24_000).arrayBuffer());
    expect(() =>
      assertMuseWav(info, 1000, {
        maxSeconds: 600,
        maxBytes: 32 * 1024 * 1024,
      }),
    ).not.toThrow();
    expect(() =>
      assertMuseWav({ ...info, durationSec: 601 }, 1000, {
        maxSeconds: 600,
        maxBytes: 1e9,
      }),
    ).toThrow(/600초/);
    expect(() =>
      assertMuseWav({ ...info, sampleRate: 44_100 }, 1000, {
        maxSeconds: 600,
        maxBytes: 1e9,
      }),
    ).toThrow(/16k/);
  });
});
