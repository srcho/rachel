import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/core/contracts";
import { createMuseProvider } from "../muse";
import { encodeWav } from "../wav";

function fakeDb() {
  const inserted: unknown[] = [];
  const db = {
    from: () => ({
      insert: async (row: unknown) => {
        inserted.push(row);
        return { error: null };
      },
    }),
  } as unknown as Db;
  return { db, inserted };
}

const wav = encodeWav(new Int16Array(16_000 * 12), 16_000); // 12초 무음

describe("MuseProvider", () => {
  it("posts multipart request, maps turns, and records audio-second usage", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({
          sessionId: "s",
          transcript: "안녕하세요 hello",
          audioDurationMs: 12_400,
          turns: [
            {
              turnId: 1,
              startMs: 0,
              endMs: 12_000,
              transcript: "안녕하세요 hello",
              speaker: "A",
            },
          ],
        }),
        { status: 200 },
      );
    });
    const { db, inserted } = fakeDb();
    const p = createMuseProvider({
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const res = await p.transcribeFile(
      {
        db,
        userId: "u",
        mode: "DIARIZATION",
        feature: "transcribe_final",
        keywords: ["레이첼"],
        sessionId: "m1-0",
      },
      wav,
    );

    expect(calls[0]?.url).toContain("sessionId=m1-0");
    const form = calls[0]?.init.body as FormData;
    const req = JSON.parse(await (form.get("request") as Blob).text());
    expect(req).toMatchObject({
      model: "muse-voice-transcribe-1.0",
      mode: "DIARIZATION",
      audioEncoding: "WAV",
      languageBias: ["Korean", "English"],
      keywords: ["레이첼"],
    });
    expect((form.get("audio") as File).size).toBe(wav.size);

    expect(res.turns[0]).toEqual({
      turnId: 1,
      startMs: 0,
      endMs: 12_000,
      text: "안녕하세요 hello",
      speaker: "A",
    });
    expect(res.costUsd).toBeCloseTo((12 / 3600) * 0.18, 6);
    expect(inserted[0]).toMatchObject({
      provider: "meta",
      feature: "transcribe_final",
      audio_seconds: 12,
    });
  });

  it("retries on 429 then succeeds", async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () =>
      n++ === 0
        ? new Response("slow down", { status: 429 })
        : new Response(JSON.stringify({ transcript: "", turns: [] }), {
            status: 200,
          }),
    );
    const { db } = fakeDb();
    const p = createMuseProvider({
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: async () => {},
    });
    await expect(
      p.transcribeFile(
        { db, userId: "u", mode: "ENDPOINTING", feature: "transcribe_live" },
        wav,
      ),
    ).resolves.toBeTruthy();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects audio over the batch limit before calling the API", async () => {
    const fetchImpl = vi.fn();
    const { db } = fakeDb();
    const p = createMuseProvider({ apiKey: "k", fetchImpl });
    const big = encodeWav(new Int16Array(16_000 * 601), 16_000);
    await expect(
      p.transcribeFile(
        { db, userId: "u", mode: "ENDPOINTING", feature: "transcribe_live" },
        big,
      ),
    ).rejects.toThrow(/600초/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
