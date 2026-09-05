"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { encodeWav } from "@/core/transcription/wav";

const RATE = 16_000;
const MAX_SEC = 60;
type ClipSession = {
  stream?: MediaStream;
  ctx?: AudioContext;
  node?: AudioWorkletNode;
  chunks: Int16Array[];
};

/** 길게 누르는 동안 PCM 을 모아 WAV 로 만든다(워클릿 재사용). */
export function useVoiceClip() {
  const [recording, setRecording] = useState(false);
  const sessionRef = useRef<ClipSession | null>(null);

  const release = useCallback(async (session: ClipSession) => {
    if (session.node) session.node.port.onmessage = null;
    for (const track of session.stream?.getTracks() ?? []) track.stop();
    await session.ctx?.close().catch(() => {});
  }, []);

  const start = useCallback(async () => {
    if (sessionRef.current) return;
    const session: ClipSession = { chunks: [] };
    sessionRef.current = session;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
      session.stream = stream;
      if (sessionRef.current !== session) {
        await release(session);
        return;
      }
      const ctx = new AudioContext({ sampleRate: RATE });
      session.ctx = ctx;
      await ctx.audioWorklet.addModule("/worklets/pcm-capture.js");
      if (sessionRef.current !== session) return;
      const node = new AudioWorkletNode(ctx, "pcm-capture", {
        processorOptions: { targetRate: RATE },
      });
      session.node = node;
      node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (
          sessionRef.current === session &&
          session.chunks.reduce((n, c) => n + c.length, 0) < MAX_SEC * RATE
        )
          session.chunks.push(new Int16Array(e.data));
      };
      ctx.createMediaStreamSource(stream).connect(node);
      setRecording(true);
    } catch (error) {
      if (sessionRef.current !== session) return;
      sessionRef.current = null;
      await release(session);
      setRecording(false);
      throw error;
    }
  }, [release]);

  const stop = useCallback(async (): Promise<Blob | null> => {
    const session = sessionRef.current;
    sessionRef.current = null;
    setRecording(false);
    if (!session) return null;
    await release(session);
    const total = session.chunks.reduce((n, c) => n + c.length, 0);
    if (total < RATE * 0.7) return null;
    const pcm = new Int16Array(total);
    let offset = 0;
    for (const chunk of session.chunks) {
      pcm.set(chunk, offset);
      offset += chunk.length;
    }
    return encodeWav(pcm, RATE);
  }, [release]);

  useEffect(
    () => () => {
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) void release(session);
    },
    [release],
  );

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
