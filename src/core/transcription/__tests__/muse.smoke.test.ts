import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Db } from "@/core/contracts";
import { createMuseProvider } from "../muse";

/**
 * 실키 스모크(S3.0). META_MODEL_API_KEY 와 MUSE_SMOKE_WAV(16k mono WAV) 가 있을 때만.
 *   set -a; . ./.env.local; set +a; MUSE_SMOKE_WAV=/path/meeting-ko.wav pnpm test -- muse.smoke
 */
const wavPath = process.env.MUSE_SMOKE_WAV;
const enabled = Boolean(process.env.META_MODEL_API_KEY && wavPath && existsSync(wavPath));

describe.skipIf(!enabled)("Muse smoke (real API)", () => {
  const usage: unknown[] = [];
  const db = { from: () => ({ insert: async (row: unknown) => { usage.push(row); return { error: null }; } }) } as unknown as Db;
  const wav = enabled ? new Blob([readFileSync(wavPath as string)], { type: "audio/wav" }) : new Blob();

  it("transcribes Korean with ENDPOINTING and DIARIZATION", async () => {
    const p = createMuseProvider();
    for (const mode of ["ENDPOINTING", "DIARIZATION"] as const) {
      const started = Date.now();
      const r = await p.transcribeFile({ db, userId: "smoke", mode, feature: mode === "DIARIZATION" ? "transcribe_final" : "transcribe_live", keywords: ["레이첼", "Muse", "VibeVoice", "김민수"], sessionId: `smoke-${mode}-${Date.now()}` }, wav);
      const ms = Date.now() - started;
      console.info(`\n=== ${mode} · ${ms}ms · audio ${Math.round(r.durationMs / 1000)}s · $${r.costUsd} ===`);
      for (const t of r.turns) console.info(`[${(t.startMs / 1000).toFixed(1)}-${(t.endMs / 1000).toFixed(1)}s]${t.speaker ? ` ${t.speaker}:` : ""} ${t.text}`);
      console.info("transcript:", r.transcript.slice(0, 400));
      expect(r.durationMs).toBeGreaterThan(10_000);
      expect(r.transcript.length).toBeGreaterThan(20);
    }
  }, 120_000);
});
