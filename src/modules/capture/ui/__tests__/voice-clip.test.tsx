// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useVoiceClip } from "../useVoiceClip";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let clip: ReturnType<typeof useVoiceClip>;
let container: HTMLDivElement;
let root: Root;
const stopTrack = vi.fn();
const close = vi.fn().mockResolvedValue(undefined);
const addModule = vi.fn().mockResolvedValue(undefined);
const getUserMedia = vi.fn();
const connect = vi.fn();
const stream = {
  getTracks: () => [{ stop: stopTrack }],
} as unknown as MediaStream;
function Probe() {
  clip = useVoiceClip();
  return null;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(async () => {
  getUserMedia.mockResolvedValue(stream);
  addModule.mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  vi.stubGlobal(
    "AudioContext",
    class {
      audioWorklet = { addModule };
      close = close;
      createMediaStreamSource() {
        return { connect };
      }
    },
  );
  vi.stubGlobal(
    "AudioWorkletNode",
    class {
      port = { onmessage: null };
    },
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Probe />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("release during pending permission stops a later granted stream without starting capture", async () => {
  const permission = deferred<MediaStream>();
  getUserMedia.mockReturnValueOnce(permission.promise);
  let pending!: Promise<void>;
  await act(async () => {
    pending = clip.start();
  });
  await act(async () => {
    expect(await clip.stop()).toBeNull();
  });
  await act(async () => {
    permission.resolve(stream);
    await pending;
  });
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(addModule).not.toHaveBeenCalled();
  expect(connect).not.toHaveBeenCalled();
  expect(clip.recording).toBe(false);
});
it("unmount during pending permission cleans up the late stream", async () => {
  const permission = deferred<MediaStream>();
  getUserMedia.mockReturnValueOnce(permission.promise);
  const pending = clip.start();
  await act(async () => root.render(null));
  await act(async () => {
    permission.resolve(stream);
    await pending;
  });
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(connect).not.toHaveBeenCalled();
});
it("release while worklet loads closes resources and never connects late", async () => {
  const worklet = deferred<void>();
  addModule.mockReturnValueOnce(worklet.promise);
  let pending!: Promise<void>;
  await act(async () => {
    pending = clip.start();
  });
  await act(async () => {
    await clip.stop();
  });
  await act(async () => {
    worklet.resolve();
    await pending;
  });
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  expect(connect).not.toHaveBeenCalled();
});
it("deduplicates starts and closes active recording on unmount", async () => {
  await act(async () => {
    await Promise.all([clip.start(), clip.start()]);
  });
  expect(getUserMedia).toHaveBeenCalledOnce();
  expect(clip.recording).toBe(true);
  await act(async () => root.render(null));
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});
it("setup failure releases the microphone and allows retry", async () => {
  addModule.mockRejectedValueOnce(new Error("worklet failed"));
  await act(async () => {
    await expect(clip.start()).rejects.toThrow("worklet failed");
  });
  expect(stopTrack).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  await act(async () => {
    await clip.start();
  });
  expect(clip.recording).toBe(true);
  await act(async () => {
    expect(await clip.stop()).toBeNull();
    expect(await clip.stop()).toBeNull();
  });
  expect(stopTrack).toHaveBeenCalledTimes(2);
});
