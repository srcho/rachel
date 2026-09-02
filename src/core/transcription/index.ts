import { createMuseProvider } from "./muse";
import type { TranscriptionProvider } from "./provider";

let provider: TranscriptionProvider | undefined;

/** 설정된 전사 프로바이더(models.ts TRANSCRIPTION.provider). 교체는 여기 한 곳. */
export function transcription(): TranscriptionProvider {
  if (!provider) provider = createMuseProvider();
  return provider;
}

export * from "./provider";
export * from "./wav";
