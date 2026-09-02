import { requireEnv } from "@/core/env";
import { TRANSCRIPTION } from "@/core/llm/models";
import { costOfAudio } from "@/core/llm/pricing";
import { recordUsage } from "@/core/llm/usage";
import type {
  TranscribeOptions,
  TranscribeResult,
  TranscriptionProvider,
  TranscriptTurn,
} from "./provider";
import { assertMuseWav, parseWavHeader } from "./wav";

const BASE_URL = "https://api.meta.ai/v1/asr/transcribe";
const MAX_KEYWORDS = 50;

interface MuseBatchResponse {
  sessionId?: string;
  transcript?: string;
  audioDurationMs?: number;
  turns?: Array<{
    turnId: number;
    startMs: number;
    endMs: number;
    transcript: string;
    speaker?: string;
  }>;
}

export interface MuseProviderOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  /** 429/5xx 재시도 횟수 */
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Meta Muse Voice Transcribe 배치 엔드포인트.
 * 한도: 요청당 10분·32MB, WAV mono 16-bit 16k/24k. 과금 $0.18/h(초 단위 내림), 실패·429 미과금.
 * 문서: https://dev.meta.ai/docs/speech-to-text/
 */
export function createMuseProvider(
  options: MuseProviderOptions = {},
): TranscriptionProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const retries = options.retries ?? 2;
  const sleep =
    options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const model = TRANSCRIPTION.model;

  async function post(
    form: FormData,
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<MuseBatchResponse> {
    const apiKey = options.apiKey ?? requireEnv("META_MODEL_API_KEY");
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const res = await fetchImpl(
        `${BASE_URL}?sessionId=${encodeURIComponent(sessionId)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
          },
          body: form,
          signal,
        },
      );
      if (res.ok) return (await res.json()) as MuseBatchResponse;
      const body = await res.text().catch(() => "");
      lastError = new Error(`Muse ${res.status}: ${body.slice(0, 200)}`);
      if (res.status === 429 || res.status >= 500) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw lastError;
    }
    throw lastError ?? new Error("Muse 요청 실패");
  }

  return {
    id: "meta",
    model,
    async transcribeFile(
      opts: TranscribeOptions,
      wav: Blob,
    ): Promise<TranscribeResult> {
      const buf = await wav.arrayBuffer();
      const info = parseWavHeader(buf);
      assertMuseWav(info, buf.byteLength, {
        maxSeconds: TRANSCRIPTION.maxSeconds,
        maxBytes: TRANSCRIPTION.maxBytes,
      });

      const request = {
        model,
        mode: opts.mode,
        audioEncoding: "WAV",
        languageBias: [...(opts.languageBias ?? TRANSCRIPTION.languageBias)],
        keywords: [...(opts.keywords ?? [])].slice(0, MAX_KEYWORDS),
      };
      const form = new FormData();
      form.append(
        "request",
        new Blob([JSON.stringify(request)], { type: "application/json" }),
      );
      form.append("audio", new Blob([buf], { type: "audio/wav" }), "audio.wav");

      const started = Date.now();
      const sessionId = opts.sessionId ?? `rachel-${crypto.randomUUID()}`;
      const data = await post(form, sessionId, opts.abortSignal);

      const durationMs =
        data.audioDurationMs ?? Math.round(info.durationSec * 1000);
      const seconds = Math.floor(durationMs / 1000);
      const costUsd = costOfAudio(`meta/${model}`, seconds);
      await recordUsage(opts.db, opts.userId, {
        provider: "meta",
        model,
        feature: opts.feature,
        audioSeconds: seconds,
        costUsd,
        ref: opts.ref,
        latencyMs: Date.now() - started,
        meta: { mode: opts.mode, sessionId },
      });

      const turns: TranscriptTurn[] = (data.turns ?? []).map((t) => ({
        turnId: t.turnId,
        startMs: t.startMs,
        endMs: t.endMs,
        text: t.transcript,
        speaker: t.speaker,
      }));
      return {
        transcript: data.transcript ?? turns.map((t) => t.text).join(" "),
        durationMs,
        turns,
        costUsd,
        raw: data,
      };
    },
  };
}
