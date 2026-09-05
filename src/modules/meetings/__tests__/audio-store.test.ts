import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { audioStore } from "../recorder/audio-store";
import { DEFAULT_SEGMENTER, Segmenter } from "../recorder/segmenter";

describe("interrupted recording recovery", () => {
  it("resumes sequence and elapsed time without overwriting earlier audio", async () => {
    const id = crypto.randomUUID();
    await audioStore.putPcm(id, 0, 0, 20_000, new Blob(["first pcm"]));
    await audioStore.appendRec(
      id,
      0,
      new Blob(["first container"]),
      "audio/webm",
      { sessionId: "first", startMs: 0, endMs: 21_000 },
    );
    const info = await audioStore.resumeInfo(id);
    expect(info).toEqual({
      nextSeq: 1,
      nextRecIndex: 1,
      elapsedMs: 21_000,
      hasData: true,
    });
    const segmenter = new Segmenter(DEFAULT_SEGMENTER, info);
    segmenter.push(new Int16Array(16_000).fill(20_000));
    const segment = segmenter.flush();
    expect(segment).toMatchObject({ seq: 1, startMs: 21_000, endMs: 22_000 });
    await audioStore.putPcm(id, 1, 21_000, 22_000, new Blob(["second pcm"]));
    await audioStore.appendRec(
      id,
      1,
      new Blob(["second container"]),
      "audio/webm",
      { sessionId: "second", startMs: 21_000, endMs: 22_000 },
    );
    const recordings = await audioStore.getRecordings(id);
    expect(recordings).toHaveLength(2);
    expect(await recordings[0]?.blob.text()).toBe("first container");
    expect(await recordings[1]?.blob.text()).toBe("second container");
    expect(recordings[1]?.startMs).toBe(21_000);
    await expect(
      audioStore.putPcm(id, 0, 0, 1, new Blob(["overwrite"])),
    ).rejects.toThrow();
    await expect(
      audioStore.appendRec(id, 0, new Blob(["overwrite"]), "audio/webm"),
    ).rejects.toThrow();
    expect(await (await audioStore.getPcm(id, 0))?.blob.text()).toBe(
      "first pcm",
    );
    await audioStore.deletePcm(id);
    await audioStore.deleteRecording(id);
  });
  it("keeps existing recordings without session metadata playable", async () => {
    const id = crypto.randomUUID();
    await audioStore.appendRec(id, 0, new Blob(["a"]), "audio/webm");
    await audioStore.appendRec(id, 1, new Blob(["b"]), "audio/webm");
    const recordings = await audioStore.getRecordings(id);
    expect(recordings).toHaveLength(1);
    expect(await recordings[0]?.blob.text()).toBe("ab");
    await audioStore.deleteRecording(id);
  });
});
