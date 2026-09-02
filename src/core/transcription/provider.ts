import type { Db } from "@/core/contracts";
import type { UsageFeature, UsageRef } from "@/core/llm/usage";

export type TranscriptionMode = "PUSH_TO_TALK" | "ENDPOINTING" | "DIARIZATION";

export interface TranscribeOptions {
  db: Db;
  userId: string;
  mode: TranscriptionMode;
  feature: UsageFeature;
  ref?: UsageRef;
  /** 언어 이름(Meta 규격: "Korean", "English") */
  languageBias?: readonly string[];
  keywords?: readonly string[];
  /** 요청 추적용(Meta sessionId) */
  sessionId?: string;
  abortSignal?: AbortSignal;
}

export interface TranscriptTurn {
  turnId: number;
  startMs: number;
  endMs: number;
  text: string;
  /** DIARIZATION 모드의 원시 라벨('A','B',…) */
  speaker?: string;
}

export interface TranscribeResult {
  transcript: string;
  durationMs: number;
  turns: TranscriptTurn[];
  costUsd: number;
  raw?: unknown;
}

export interface TranscriptionProvider {
  readonly id: "meta" | "openai";
  readonly model: string;
  transcribeFile(opts: TranscribeOptions, wav: Blob): Promise<TranscribeResult>;
}
