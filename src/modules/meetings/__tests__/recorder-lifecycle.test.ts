// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { audioStore } from "../recorder/audio-store";
import { MeetingRecorder, type RecorderEvents } from "../recorder/recorder";

vi.mock("../recorder/uploader", () => ({
  Uploader: class {
    enqueue = vi.fn(async () => {});
    drain = vi.fn(async () => {});
    stop = vi.fn();
  },
}));
function events(): RecorderEvents {
  return {
    onState: vi.fn(),
    onLevel: vi.fn(),
    onSegmentQueued: vi.fn(),
    onTurns: vi.fn(),
    onTick: vi.fn(),
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("recorder lifecycle", () => {
  it("releases a microphone granted after the screen was unmounted", async () => {
    vi.spyOn(audioStore, "resumeInfo").mockResolvedValue({
      nextSeq: 0,
      nextRecIndex: 0,
      elapsedMs: 0,
      hasData: false,
    });
    let grant: (value: MediaStream) => void = () => {};
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          grant = resolve;
        }),
    );
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const stopTrack = vi.fn();
    const ev = events();
    const recorder = new MeetingRecorder("meeting", ev);
    const starting = recorder.start();
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    const stopping = recorder.stop();
    grant({ getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream);
    await starting;
    await stopping;
    expect(stopTrack).toHaveBeenCalled();
    expect(ev.onState).not.toHaveBeenCalledWith("recording", undefined);
    expect(recorder.state).toBe("done");
  });
  it("does not finish before the last compressed audio write is durable", async () => {
    vi.spyOn(audioStore, "resumeInfo").mockResolvedValue({
      nextSeq: 3,
      nextRecIndex: 4,
      elapsedMs: 60_000,
      hasData: true,
    });
    vi.spyOn(audioStore, "persist").mockResolvedValue(true);
    let persist: () => void = () => {};
    const write = vi.spyOn(audioStore, "appendRec").mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          persist = resolve;
        }),
    );
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
      },
    });
    vi.stubGlobal(
      "AudioContext",
      class {
        state = "running";
        audioWorklet = { addModule: async () => {} };
        createMediaStreamSource() {
          return { connect() {} };
        }
        resume = async () => {};
        close = async () => {};
        suspend = async () => {};
      },
    );
    vi.stubGlobal(
      "AudioWorkletNode",
      class {
        port = {};
        disconnect() {}
      },
    );
    vi.stubGlobal(
      "MediaRecorder",
      class {
        static isTypeSupported() {
          return true;
        }
        mimeType = "audio/webm";
        state = "inactive";
        ondataavailable?: (e: { data: Blob }) => void;
        onstop?: () => void;
        start() {
          this.state = "recording";
        }
        pause() {
          this.state = "paused";
        }
        stop() {
          this.state = "inactive";
          this.ondataavailable?.({ data: new Blob(["last chunk"]) });
          this.onstop?.();
        }
      },
    );
    const recorder = new MeetingRecorder("meeting", events());
    await recorder.start();
    let finished = false;
    const stopping = recorder.stop().then(() => {
      finished = true;
    });
    await vi.waitFor(() => expect(write).toHaveBeenCalled());
    expect(finished).toBe(false);
    expect(write.mock.calls[0]?.[1]).toBe(4);
    expect(write.mock.calls[0]?.[4]).toMatchObject({ startMs: 60_000 });
    persist();
    await stopping;
    expect(finished).toBe(true);
  });
});
