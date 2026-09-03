"use client";
import { useCallback, useRef, useState } from "react";
import { encodeWav } from "@/core/transcription/wav";

const RATE = 16_000;
const MAX_SEC = 60;

/** 길게 누르는 동안 PCM 을 모아 WAV 로 만든다(워클릿 재사용). */
export function useVoiceClip() {
  const [recording, setRecording] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Int16Array[]>([]);

  const start = useCallback(async () => {
    if (recording) return;
    chunks.current = [];
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
      },
    });
    const ctx = new AudioContext({ sampleRate: RATE });
    await ctx.audioWorklet.addModule("/worklets/pcm-capture.js");
    const node = new AudioWorkletNode(ctx, "pcm-capture", {
      processorOptions: { targetRate: RATE },
    });
    node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      if (chunks.current.reduce((n, c) => n + c.length, 0) < MAX_SEC * RATE)
        chunks.current.push(new Int16Array(e.data));
    };
    ctx.createMediaStreamSource(stream).connect(node);
    ctxRef.current = ctx;
    streamRef.current = stream;
    setRecording(true);
  }, [recording]);

  const stop = useCallback(async (): Promise<Blob | null> => {
    setRecording(false);
    for (const t of streamRef.current?.getTracks() ?? []) t.stop();
    await ctxRef.current?.close().catch(() => {});
    const total = chunks.current.reduce((n, c) => n + c.length, 0);
    if (total < RATE * 0.7) return null; // 0.7초 미만은 무시
    const pcm = new Int16Array(total);
    let o = 0;
    for (const c of chunks.current) {
      pcm.set(c, o);
      o += c.length;
    }
    return encodeWav(pcm, RATE);
  }, []);

  return { recording, start, stop };
}

export async function transcribeClip(wav: Blob): Promise<string> {
  const form = new FormData();
  form.append("audio", wav, "clip.wav");
  const res = await fetch("/api/transcribe/quick", {
    method: "POST",
    body: form,
  });
  if (!res.ok)
    throw new Error(
      (await res.json().catch(() => ({ error: res.statusText }))).error ??
        "전사 실패",
    );
  return ((await res.json()) as { text: string }).text;
}
